import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { BrowserSignIn, Credential } from "#adapter/index.ts";
import { AiregError, ErrorCode } from "#core/errors.ts";

/** How long the browser has to come back before aireg gives up waiting. */
const WAIT_MS = 5 * 60_000;
const CALLBACK_PATH = "/callback";
const MAX_BODY_BYTES = 1024 * 1024;

interface Endpoints {
  authorization: string;
  token: string;
}

/** What the person sees while aireg waits, so a browser that did not open is not a dead end. */
export interface BrowserPrompt {
  /** Asked to open `url`; it may fail silently, since the URL is shown either way. */
  open(url: string): void;
  /** Shown before waiting, with the URL to open by hand. */
  waiting(url: string): void;
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
  if (url.username !== "" || url.password !== "") {
    throw failed(`The sign-in server's ${field} carries credentials.`);
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

/** RFC 8414 metadata, which an OpenID provider also serves. */
async function discover(issuer: URL, signal: AbortSignal): Promise<Endpoints> {
  const base = issuer.href.replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(`${base}/.well-known/oauth-authorization-server`, {
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
  return {
    authorization: trustedUrl(body.authorization_endpoint, issuer.origin, "authorization endpoint")
      .href,
    token: trustedUrl(body.token_endpoint, issuer.origin, "token endpoint").href,
  };
}

function page(message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>aireg</title><p>${message}</p>`;
}

/** The loopback redirect of RFC 8252: any free port, answered once, for this `state` only. */
async function listen(
  state: string,
  signal: AbortSignal,
): Promise<{ redirectUri: string; code: Promise<string>; server: Server }> {
  let settle: { accept(code: string): void; reject(error: Error): void } | undefined;
  const code = new Promise<string>((accept, reject) => {
    settle = { accept, reject };
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method !== "GET" || url.pathname !== CALLBACK_PATH) {
      response.writeHead(404).end();
      return;
    }
    // Anything else on this port is another page's request, not this sign-in's answer.
    if (url.searchParams.get("state") !== state) {
      response.writeHead(400, { "content-type": "text/html" }).end(page("This sign-in expired."));
      return;
    }
    const value = url.searchParams.get("code");
    const refused = url.searchParams.get("error");
    response.writeHead(value === null ? 400 : 200, { "content-type": "text/html" });
    if (value === null) {
      response.end(page("Sign-in did not finish. You can close this tab."));
      // Only a known word: the description is the server's text and may say anything.
      const reason = /^[a-z_]{1,64}$/.test(refused ?? "") ? ` (${refused})` : "";
      settle?.reject(failed(`The sign-in was not completed${reason}.`));
      return;
    }
    response.end(page("Signed in. You can close this tab and go back to the terminal."));
    settle?.accept(value);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  signal.addEventListener(
    "abort",
    () => settle?.reject(failed("The sign-in did not finish in time.")),
    {
      once: true,
    },
  );
  const { port } = server.address() as AddressInfo;
  return { redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`, code, server };
}

function tokens(body: Record<string, unknown>): Credential {
  const accessToken = body.access_token;
  if (typeof accessToken !== "string" || accessToken === "") {
    throw failed("The sign-in server returned no access token.");
  }
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : undefined;
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : undefined;
  return {
    type: "bearer",
    accessToken,
    ...(refreshToken === undefined || refreshToken === "" ? {} : { refreshToken }),
    ...(expiresIn === undefined ? {} : { expiresAtMs: Date.now() + expiresIn * 1000 }),
  };
}

async function exchange(
  endpoints: Endpoints,
  form: Record<string, string>,
  signal: AbortSignal,
): Promise<Credential> {
  let response: Response;
  try {
    response = await fetch(endpoints.token, {
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
    const code =
      typeof body.error === "string" && /^[a-z_]{1,64}$/.test(body.error) ? body.error : "";
    throw failed(
      `The sign-in server refused the sign-in (HTTP ${response.status}${code === "" ? "" : `, ${code}`}).`,
    );
  }
  return tokens(body);
}

/**
 * Signs in through the system browser as RFC 8252 describes for a native app: an
 * authorization code with PKCE, returned to a one-off server on a loopback port.
 */
export async function signInWithBrowser(
  client: BrowserSignIn,
  prompt: BrowserPrompt,
  signal: AbortSignal,
): Promise<Credential> {
  const limited = AbortSignal.any([signal, AbortSignal.timeout(WAIT_MS)]);
  const endpoints = await discover(trustedUrl(client.issuer, undefined, "address"), limited);
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(24).toString("base64url");
  const { redirectUri, code, server } = await listen(state, limited);
  try {
    const authorize = new URL(endpoints.authorization);
    authorize.search = new URLSearchParams({
      response_type: "code",
      client_id: client.clientId,
      redirect_uri: redirectUri,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      state,
      ...(client.scope === undefined ? {} : { scope: client.scope }),
    }).toString();
    prompt.waiting(authorize.href);
    prompt.open(authorize.href);
    return await exchange(
      endpoints,
      {
        grant_type: "authorization_code",
        client_id: client.clientId,
        code: await code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      },
      limited,
    );
  } finally {
    server.closeAllConnections();
    server.close();
  }
}
