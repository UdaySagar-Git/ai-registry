import { createHash, randomBytes } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { BrowserSignIn, Credential } from "#adapter/index.ts";
import { AiregError, ErrorCode } from "#core/errors.ts";

/** How long the browser has to come back before aireg gives up waiting. */
const WAIT_MS = 5 * 60_000;
const CALLBACK_PATH = "/callback";
const DONE_PATH = "/done";
const MAX_BODY_BYTES = 1024 * 1024;
/** An OAuth error code; anything else is the server's free text and may say anything. */
const ERROR_CODE = /^[a-z_]{1,64}$/;

/** The callback page loads nothing, so nothing it loads can see the code in its address. */
const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  connection: "close",
};

interface Server {
  issuer: string;
  authorization: string;
  token: string;
  /** RFC 9207: the callback names its issuer, so one from another server is told apart. */
  namesIssuer: boolean;
}

/** What the person sees while aireg waits, so a browser that did not open is not a dead end. */
export interface BrowserPrompt {
  /** Asked to open `url`; it may fail silently, since the URL is shown either way. */
  open(url: string): void;
  /** Shown before waiting, with the URL to open by hand and the port the browser comes back to. */
  waiting(url: string, port: number): void;
}

function failed(message: string, cause?: unknown): AiregError {
  return new AiregError(message, { code: ErrorCode.Unauthorized, cause });
}

/** https, or http on a loopback host for a server running on this machine. */
function trustedUrl(raw: unknown, origin: string | undefined, field: string): URL {
  let url: URL;
  try {
    url = new URL(String(raw));
  } catch {
    throw failed(`The sign-in server's ${field} is not a URL.`);
  }
  const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw failed(`The sign-in server's ${field} is not https.`);
  }
  if (url.username !== "" || url.password !== "" || url.hash !== "") {
    throw failed(`The sign-in server's ${field} carries credentials or a fragment.`);
  }
  // An endpoint elsewhere would receive the code or the verifier.
  if (origin !== undefined && url.origin !== origin) {
    throw failed(`The sign-in server's ${field} is not on ${origin}.`);
  }
  return url;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) throw failed("The sign-in server's answer is too large.");
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** RFC 8414 metadata, at the well-known path inserted before the issuer's own path. */
async function discover(issuer: URL, signal: AbortSignal): Promise<Server> {
  const name = issuer.href.replace(/\/$/, "");
  const path = issuer.pathname.replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(`${issuer.origin}/.well-known/oauth-authorization-server${path}`, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal,
    });
  } catch (cause) {
    throw failed(`Cannot reach ${issuer.origin} to sign in.`, cause);
  }
  if (!response.ok) {
    throw failed(`${issuer.origin} has no sign-in metadata (HTTP ${response.status}).`);
  }
  const body = await readJson(response);
  // RFC 8414 3.3: metadata for any other issuer is not this server's, wherever it was served.
  if (typeof body.issuer !== "string" || body.issuer.replace(/\/$/, "") !== name) {
    throw failed(`${issuer.origin}'s sign-in metadata is for another server.`);
  }
  return {
    issuer: body.issuer,
    authorization: trustedUrl(body.authorization_endpoint, issuer.origin, "authorization endpoint")
      .href,
    token: trustedUrl(body.token_endpoint, issuer.origin, "token endpoint").href,
    namesIssuer: body.authorization_response_iss_parameter_supported === true,
  };
}

function page(message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>aireg</title><p>${message}</p>`;
}

function answer(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, PAGE_HEADERS).end(page(message));
}

/** Why the browser came back without a code, from its OAuth error code alone. */
function refusal(error: string | null): AiregError {
  if (error === "access_denied") return failed("The sign-in was declined in the browser.");
  const reason = ERROR_CODE.test(error ?? "") ? ` (${error})` : "";
  return failed(`The sign-in was not completed${reason}.`);
}

/** What the browser brought back, and how to tell it the outcome once aireg knows it. */
interface Callback {
  redirectUri: string;
  port: number;
  code: Promise<string>;
  /** Tells the browser how the sign-in ended, then stops listening. */
  close(signedIn: boolean): Promise<void>;
}

/** How long a browser sent on to the outcome page has to arrive before the port closes. */
const ARRIVAL_MS = 2_000;

/**
 * The loopback redirect of RFC 8252 on 127.0.0.1, answered once for this `state`. The
 * browser is sent on to a page with no code in its address, held until the sign-in is
 * done, so the page says how it ended.
 */
async function listen(server: Server, state: string, ports: readonly number[]): Promise<Callback> {
  let settle: { accept(code: string): void; reject(error: Error): void } | undefined;
  const code = new Promise<string>((accept, reject) => {
    settle = { accept, reject };
  });
  // Awaited in a race it may lose; a late refusal must not surface as an unhandled one.
  code.catch(() => undefined);
  let arrived: () => void = () => {};
  const arrival = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const waiting: ServerResponse[] = [];
  let outcome: boolean | undefined;
  let answered = false;
  let host = "";
  const tell = (response: ServerResponse, signedIn: boolean) =>
    signedIn
      ? answer(response, 200, "Signed in. You can close this tab and go back to the terminal.")
      : answer(response, 500, "The sign-in did not finish. The terminal says why.");

  const http = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    // A page elsewhere that rebinds its own name to 127.0.0.1 sends its own Host.
    if (request.headers.host !== host) return answer(response, 421, "Wrong address.");
    if (request.method !== "GET") return answer(response, 405, "Not allowed.");
    if (url.pathname === DONE_PATH && answered) {
      arrived();
      return outcome === undefined ? waiting.push(response) : tell(response, outcome);
    }
    if (url.pathname !== CALLBACK_PATH) return answer(response, 404, "Not found.");
    // Anything else on this port is another page's request, not this sign-in's answer.
    if (url.searchParams.get("state") !== state) {
      return answer(response, 400, "This sign-in expired.");
    }
    if (answered) return answer(response, 409, "This sign-in already finished.");
    const iss = url.searchParams.get("iss");
    if (iss === null ? server.namesIssuer : iss !== server.issuer) {
      answer(response, 400, "This sign-in came back from another server.");
      return settle?.reject(
        failed("The sign-in came back from a server other than the one it went to."),
      );
    }
    answered = true;
    const value = url.searchParams.get("code");
    if (value === null || value === "") {
      answer(response, 400, "The sign-in did not finish. You can close this tab.");
      arrived();
      return settle?.reject(refusal(url.searchParams.get("error")));
    }
    // See other, so the address the code came in on is not the one the tab keeps.
    response.writeHead(303, { ...PAGE_HEADERS, location: DONE_PATH }).end();
    settle?.accept(value);
  });
  await bind(http, ports.length === 0 ? [0] : ports);
  const { port } = http.address() as AddressInfo;
  host = `127.0.0.1:${port}`;
  return {
    redirectUri: `http://${host}${CALLBACK_PATH}`,
    port,
    code,
    close: async (signedIn) => {
      outcome = signedIn;
      if (answered) {
        let timer: NodeJS.Timeout | undefined;
        await Promise.race([
          arrival,
          new Promise((resolve) => {
            timer = setTimeout(resolve, ARRIVAL_MS);
          }),
        ]);
        clearTimeout(timer);
      }
      await Promise.all(
        waiting.splice(0).map(
          (response) =>
            new Promise<void>((resolve) => {
              response.once("close", resolve);
              tell(response, signedIn);
            }),
        ),
      );
      http.close();
      http.closeAllConnections();
    },
  };
}

/** The first of `ports` free on 127.0.0.1; 0 is any. */
async function bind(
  http: ReturnType<typeof createServer>,
  ports: readonly number[],
): Promise<void> {
  for (const port of ports) {
    const bound = await new Promise<boolean>((resolve) => {
      const busy = () => resolve(false);
      http.once("error", busy);
      http.listen(port, "127.0.0.1", () => {
        http.off("error", busy);
        resolve(true);
      });
    });
    if (bound) return;
  }
  throw failed(
    `Ports ${ports.join(", ")} are all in use, and the sign-in can only come back to one of them.`,
  );
}

function tokens(body: Record<string, unknown>): Credential {
  const accessToken = body.access_token;
  if (typeof accessToken !== "string" || accessToken === "") {
    throw failed("The sign-in server returned no access token.");
  }
  if (typeof body.token_type === "string" && body.token_type.toLowerCase() !== "bearer") {
    throw failed("The sign-in server returned a token aireg cannot send.");
  }
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : "";
  const expiresIn = body.expires_in;
  const lasts = typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0;
  return {
    type: "bearer",
    accessToken,
    ...(refreshToken === "" ? {} : { refreshToken }),
    ...(lasts ? { expiresAtMs: Date.now() + expiresIn * 1000 } : {}),
  };
}

async function exchange(
  server: Server,
  form: Record<string, string>,
  signal: AbortSignal,
): Promise<Credential> {
  let response: Response;
  try {
    response = await fetch(server.token, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form),
      redirect: "error",
      signal,
    });
  } catch (cause) {
    throw failed("Cannot reach the sign-in server to finish signing in.", cause);
  }
  const body = await readJson(response);
  if (!response.ok) {
    const code = typeof body.error === "string" && ERROR_CODE.test(body.error) ? body.error : "";
    throw failed(
      `The sign-in server refused the sign-in (HTTP ${response.status}${code === "" ? "" : `, ${code}`}).`,
    );
  }
  return tokens(body);
}

function authorizeUrl(
  server: Server,
  client: BrowserSignIn,
  redirectUri: string,
  verifier: string,
  state: string,
): string {
  const url = new URL(server.authorization);
  for (const [key, value] of Object.entries({
    response_type: "code",
    client_id: client.clientId,
    redirect_uri: redirectUri,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state,
    ...(client.scope === undefined ? {} : { scope: client.scope }),
  })) {
    url.searchParams.set(key, value);
  }
  return url.href;
}

/**
 * Signs in through the system browser as RFC 8252 describes for a native app: an
 * authorization code with PKCE, returned to a one-off server on a loopback port.
 * `finish` stores the sign-in; the browser tab reports success only once it has.
 */
export async function signInWithBrowser<T>(
  client: BrowserSignIn,
  prompt: BrowserPrompt,
  signal: AbortSignal,
  finish: (credential: Credential) => Promise<T>,
): Promise<T> {
  const limited = AbortSignal.any([signal, AbortSignal.timeout(WAIT_MS)]);
  const server = await discover(trustedUrl(client.issuer, undefined, "address"), limited);
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  const callback = await listen(server, state, client.ports ?? []);
  let signedIn = false;
  try {
    const url = authorizeUrl(server, client, callback.redirectUri, verifier, state);
    prompt.waiting(url, callback.port);
    prompt.open(url);
    const code = await Promise.race([callback.code, aborted(limited, signal)]);
    const credential = await exchange(
      server,
      {
        grant_type: "authorization_code",
        client_id: client.clientId,
        code,
        redirect_uri: callback.redirectUri,
        code_verifier: verifier,
      },
      limited,
    );
    const done = await finish(credential);
    signedIn = true;
    return done;
  } finally {
    await callback.close(signedIn);
  }
}

/** Rejects when `limited` aborts: the person canceled when `signal` did, else time ran out. */
function aborted(limited: AbortSignal, signal: AbortSignal): Promise<never> {
  const stopped = new Promise<never>((_, reject) => {
    const stop = () =>
      reject(
        signal.aborted
          ? failed("The sign-in was canceled.")
          : failed("The sign-in did not finish in time."),
      );
    if (limited.aborted) stop();
    else limited.addEventListener("abort", stop, { once: true });
  });
  stopped.catch(() => undefined);
  return stopped;
}
