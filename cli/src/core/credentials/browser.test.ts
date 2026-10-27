import { createHash } from "node:crypto";
import { createServer, get, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { Credential } from "#adapter/index.ts";
import { type BrowserPrompt, signInWithBrowser } from "./browser.ts";

interface Stub {
  issuer: string;
  /** What the token endpoint was sent. */
  exchanged: URLSearchParams[];
  close(): Promise<void>;
}

interface StubOptions {
  refuse?: string;
  tokenOrigin?: string;
  tokenStatus?: number;
  tokenType?: string;
  /** The issuer its metadata names, when not its own. */
  metadataIssuer?: string;
  /** The `iss` its callback carries: its own by default, null for none. */
  iss?: string | null;
}

/** An authorization server that signs anyone in, or refuses with `refuse`. */
async function stub(options: StubOptions = {}): Promise<Stub> {
  const challenges = new Map<string, string>();
  const exchanged: URLSearchParams[] = [];
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", issuer);
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          issuer: options.metadataIssuer ?? issuer,
          authorization_endpoint: `${issuer}/oauth/authorize`,
          token_endpoint: `${options.tokenOrigin ?? issuer}/oauth/token`,
          authorization_response_iss_parameter_supported: true,
        }),
      );
      return;
    }
    if (url.pathname === "/oauth/authorize") {
      const back = new URL(url.searchParams.get("redirect_uri") ?? "");
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      const iss = options.iss === undefined ? issuer : options.iss;
      if (iss !== null) back.searchParams.set("iss", iss);
      if (options.refuse === undefined) {
        challenges.set("code-1", url.searchParams.get("code_challenge") ?? "");
        back.searchParams.set("code", "code-1");
      } else {
        back.searchParams.set("error", options.refuse);
        back.searchParams.set("error_description", "\u001B]8;;evil\u0007click");
      }
      response.writeHead(302, { location: back.href }).end();
      return;
    }
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const form = new URLSearchParams(body);
      exchanged.push(form);
      const verifier = form.get("code_verifier") ?? "";
      const proven =
        createHash("sha256").update(verifier).digest("base64url") ===
        challenges.get(form.get("code") ?? "");
      const status = options.tokenStatus ?? (proven ? 200 : 400);
      response.writeHead(status, { "content-type": "application/json" });
      response.end(
        JSON.stringify(
          status === 200
            ? {
                access_token: "access-1",
                token_type: options.tokenType ?? "Bearer",
                refresh_token: "refresh-1",
                expires_in: 900,
              }
            : { error: "invalid_grant", error_description: "<b>no</b>" },
        ),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    issuer,
    exchanged,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

interface Page {
  /** Where the tab ended up. */
  url: string;
  status: number;
  headers: Headers;
  text: string;
}

/** A browser that follows the redirect back to aireg, as the person signing in would. */
function browser(): BrowserPrompt & { shown: string[]; page: Promise<Page> } {
  const shown: string[] = [];
  let show: (page: Page) => void = () => {};
  const page = new Promise<Page>((resolve) => {
    show = resolve;
  });
  return {
    shown,
    page,
    waiting: (url) => shown.push(url),
    open: (url) => {
      void fetch(url)
        .then(async (answer) =>
          show({
            url: answer.url,
            status: answer.status,
            headers: answer.headers,
            text: await answer.text(),
          }),
        )
        .catch(() => {});
    },
  };
}

/** A page on a name rebound to 127.0.0.1 reaches the port, but its browser sends that name. */
function rebound(url: URL): Promise<number> {
  return new Promise((resolve, reject) => {
    get(
      {
        host: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        headers: { host: `attacker.example:${url.port}` },
      },
      (answer) => {
        answer.resume();
        resolve(answer.statusCode ?? 0);
      },
    ).on("error", reject);
  });
}

const keep = async (credential: Credential) => credential;
const never = new AbortController().signal;

let server: Stub | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("signInWithBrowser", () => {
  it("signs in with an authorization code bound to its PKCE verifier", async () => {
    server = await stub();
    const prompt = browser();
    const credential = await signInWithBrowser(
      { issuer: server.issuer, clientId: "client-1", scope: "openid" },
      prompt,
      never,
      keep,
    );
    expect(credential).toMatchObject({
      type: "bearer",
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });
    expect(credential.type === "bearer" && credential.expiresAtMs).toBeGreaterThan(Date.now());
    const authorize = new URL(prompt.shown[0] ?? "");
    expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
      response_type: "code",
      client_id: "client-1",
      code_challenge_method: "S256",
      scope: "openid",
    });
    expect(authorize.searchParams.get("redirect_uri")).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/callback$/,
    );
    expect(server.exchanged[0]?.get("grant_type")).toBe("authorization_code");
    expect(server.exchanged[0]?.get("client_id")).toBe("client-1");
  });

  it("tells the browser it signed in only once the sign-in is stored", async () => {
    server = await stub();
    const prompt = browser();
    let stored = false;
    await signInWithBrowser(
      { issuer: server.issuer, clientId: "client-1" },
      prompt,
      never,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        stored = true;
      },
    );
    const page = await prompt.page;
    expect(stored).toBe(true);
    expect(page.status).toBe(200);
    expect(page.text).toContain("Signed in.");
    expect(new URL(page.url).pathname).toBe("/done");
    expect(page.url).not.toContain("code");
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    expect(page.headers.get("content-security-policy")).toContain("default-src 'none'");
  });

  it("tells the browser the sign-in failed when storing it does", async () => {
    server = await stub();
    const prompt = browser();
    await expect(
      signInWithBrowser({ issuer: server.issuer, clientId: "client-1" }, prompt, never, () =>
        Promise.reject(new Error("the daemon is down")),
      ),
    ).rejects.toThrow("the daemon is down");
    const page = await prompt.page;
    expect(page.status).toBe(500);
    expect(page.text).toContain("The terminal says why.");
  });

  it("finishes though the tab is closed while the sign-in is stored", async () => {
    server = await stub();
    const started = Date.now();
    const credential = await signInWithBrowser(
      { issuer: server.issuer, clientId: "client-1" },
      {
        waiting: () => {},
        open: (url) => {
          void fetch(url, { redirect: "manual" })
            .then((authorize) =>
              fetch(authorize.headers.get("location") ?? "", { redirect: "manual" }),
            )
            .then((callback) => {
              const done = new URL(callback.headers.get("location") ?? "", callback.url);
              const request = get(done);
              request.on("error", () => {});
              setTimeout(() => request.destroy(), 20);
            });
        },
      },
      never,
      async (signedIn) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return signedIn;
      },
    );
    expect(credential).toMatchObject({ accessToken: "access-1" });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("says the person declined, and never the server's own words", async () => {
    server = await stub({ refuse: "access_denied" });
    await expect(
      signInWithBrowser({ issuer: server.issuer, clientId: "client-1" }, browser(), never, keep),
    ).rejects.toThrow(/^The sign-in was declined in the browser\.$/);
  });

  it("names any other refusal by its code alone", async () => {
    server = await stub({ refuse: "temporarily_unavailable" });
    await expect(
      signInWithBrowser({ issuer: server.issuer, clientId: "client-1" }, browser(), never, keep),
    ).rejects.toThrow(/^The sign-in was not completed \(temporarily_unavailable\)\.$/);
  });

  it("names the code a refused exchange returns", async () => {
    server = await stub({ tokenStatus: 400 });
    await expect(
      signInWithBrowser({ issuer: server.issuer, clientId: "client-1" }, browser(), never, keep),
    ).rejects.toThrow("The sign-in server refused the sign-in (HTTP 400, invalid_grant).");
  });

  it("refuses a token it cannot send as a bearer token", async () => {
    server = await stub({ tokenType: "DPoP" });
    await expect(
      signInWithBrowser({ issuer: server.issuer, clientId: "client-1" }, browser(), never, keep),
    ).rejects.toThrow("a token aireg cannot send");
  });

  it("refuses a token endpoint on another origin, which would receive the code", async () => {
    server = await stub({ tokenOrigin: "https://elsewhere.example" });
    await expect(
      signInWithBrowser({ issuer: server.issuer, clientId: "client-1" }, browser(), never, keep),
    ).rejects.toThrow("token endpoint is not on");
  });

  it("refuses metadata that names another issuer (RFC 8414)", async () => {
    server = await stub({ metadataIssuer: "https://elsewhere.example" });
    await expect(
      signInWithBrowser({ issuer: server.issuer, clientId: "client-1" }, browser(), never, keep),
    ).rejects.toThrow("metadata is for another server");
    expect(server.exchanged).toEqual([]);
  });

  it.each([
    ["another issuer", "https://elsewhere.example"],
    ["no issuer, though the server names it", null],
  ])("refuses a callback with %s (RFC 9207) and redeems nothing", async (_, iss) => {
    server = await stub({ iss });
    const prompt = browser();
    await expect(
      signInWithBrowser({ issuer: server.issuer, clientId: "client-1" }, prompt, never, keep),
    ).rejects.toThrow("came back from a server other than the one it went to");
    expect((await prompt.page).status).toBe(400);
    expect(server.exchanged).toEqual([]);
  });

  it("refuses a sign-in server that is not https", async () => {
    await expect(
      signInWithBrowser(
        { issuer: "http://auth.example.com", clientId: "client-1" },
        browser(),
        never,
        keep,
      ),
    ).rejects.toThrow("is not https");
  });

  it("stops waiting and frees the port when canceled", async () => {
    server = await stub();
    const controller = new AbortController();
    let port = 0;
    const pending = signInWithBrowser(
      { issuer: server.issuer, clientId: "client-1" },
      {
        waiting: (_, bound) => {
          port = bound;
        },
        open: () => controller.abort(),
      },
      controller.signal,
      keep,
    );
    await expect(pending).rejects.toThrow("The sign-in was canceled.");
    const free = createServer();
    await new Promise<void>((resolve) => free.listen(port, "127.0.0.1", resolve));
    await new Promise((resolve) => free.close(resolve));
  });

  it("comes back on the first free port of those the client registered", async () => {
    server = await stub();
    const taken = createServer();
    await new Promise<void>((resolve) => taken.listen(0, "127.0.0.1", resolve));
    const busy = (taken.address() as AddressInfo).port;
    const spare = createServer();
    await new Promise<void>((resolve) => spare.listen(0, "127.0.0.1", resolve));
    const free = (spare.address() as AddressInfo).port;
    await new Promise((resolve) => spare.close(resolve));
    try {
      const prompt = browser();
      await signInWithBrowser(
        { issuer: server.issuer, clientId: "client-1", ports: [busy, free] },
        prompt,
        never,
        keep,
      );
      expect(new URL(prompt.shown[0] ?? "").searchParams.get("redirect_uri")).toBe(
        `http://127.0.0.1:${free}/callback`,
      );
      await expect(
        signInWithBrowser(
          { issuer: server.issuer, clientId: "client-1", ports: [busy] },
          browser(),
          never,
          keep,
        ),
      ).rejects.toThrow(`Ports ${busy} are all in use`);
    } finally {
      await new Promise((resolve) => taken.close(resolve));
    }
  });

  it("ignores an answer for another sign-in, or sent to another host name", async () => {
    server = await stub();
    const prompt = browser();
    const statuses: number[] = [];
    const pending = signInWithBrowser(
      { issuer: server.issuer, clientId: "client-1" },
      {
        waiting: prompt.waiting,
        open: (url) => {
          const redirect = new URL(new URL(url).searchParams.get("redirect_uri") ?? "");
          redirect.searchParams.set("state", "someone-else");
          redirect.searchParams.set("code", "stolen");
          void fetch(redirect)
            .then((answer) => statuses.push(answer.status))
            .then(() => rebound(new URL(redirect)))
            .then((status) => statuses.push(status))
            .then(() => fetch(url));
        },
      },
      never,
      keep,
    );
    await expect(pending).resolves.toMatchObject({ accessToken: "access-1" });
    expect(statuses).toEqual([400, 421]);
    expect(server.exchanged.map((form) => form.get("code"))).toEqual(["code-1"]);
  });
});
