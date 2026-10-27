import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { signInWithBrowser } from "./browser.ts";

interface Stub {
  issuer: string;
  /** What the token endpoint was sent. */
  exchanged: URLSearchParams[];
  close(): Promise<void>;
}

/** An authorization server that signs anyone in, or refuses with `refuse`. */
async function stub(
  options: { refuse?: string; tokenOrigin?: string; tokenStatus?: number } = {},
): Promise<Stub> {
  const challenges = new Map<string, string>();
  const exchanged: URLSearchParams[] = [];
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", issuer);
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/oauth/authorize`,
          token_endpoint: `${options.tokenOrigin ?? issuer}/oauth/token`,
        }),
      );
      return;
    }
    if (url.pathname === "/oauth/authorize") {
      const back = new URL(url.searchParams.get("redirect_uri") ?? "");
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      if (options.refuse === undefined) {
        challenges.set("code-1", url.searchParams.get("code_challenge") ?? "");
        back.searchParams.set("code", "code-1");
      } else {
        back.searchParams.set("error", options.refuse);
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
            ? { access_token: "access-1", refresh_token: "refresh-1", expires_in: 900 }
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

/** A browser that follows the redirect back to aireg, as the person signing in would. */
function browser(): { open(url: string): void; waiting(url: string): void; shown: string[] } {
  const shown: string[] = [];
  return {
    shown,
    waiting: (url) => shown.push(url),
    open: (url) => {
      void fetch(url).catch(() => {});
    },
  };
}

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
      new AbortController().signal,
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

  it("says why when the person declines, and never the server's own words", async () => {
    server = await stub({ refuse: "access_denied" });
    await expect(
      signInWithBrowser(
        { issuer: server.issuer, clientId: "client-1" },
        browser(),
        new AbortController().signal,
      ),
    ).rejects.toThrow("The sign-in was not completed (access_denied).");
  });

  it("names the code a refused exchange returns", async () => {
    server = await stub({ tokenStatus: 400 });
    await expect(
      signInWithBrowser(
        { issuer: server.issuer, clientId: "client-1" },
        browser(),
        new AbortController().signal,
      ),
    ).rejects.toThrow("The sign-in server refused the sign-in (HTTP 400, invalid_grant).");
  });

  it("refuses a token endpoint on another origin, which would receive the code", async () => {
    server = await stub({ tokenOrigin: "https://elsewhere.example" });
    await expect(
      signInWithBrowser(
        { issuer: server.issuer, clientId: "client-1" },
        browser(),
        new AbortController().signal,
      ),
    ).rejects.toThrow("token endpoint is not on");
  });

  it("refuses a sign-in server that is not https", async () => {
    await expect(
      signInWithBrowser(
        { issuer: "http://auth.example.com", clientId: "client-1" },
        browser(),
        new AbortController().signal,
      ),
    ).rejects.toThrow("is not https");
  });

  it("ignores an answer for another sign-in", async () => {
    server = await stub();
    const prompt = browser();
    const pending = signInWithBrowser(
      { issuer: server.issuer, clientId: "client-1" },
      {
        waiting: prompt.waiting,
        open: (url) => {
          const redirect = new URL(new URL(url).searchParams.get("redirect_uri") ?? "");
          redirect.searchParams.set("state", "someone-else");
          redirect.searchParams.set("code", "stolen");
          void fetch(redirect)
            .then((answer) => expect(answer.status).toBe(400))
            .then(() => fetch(url));
        },
      },
      new AbortController().signal,
    );
    await expect(pending).resolves.toMatchObject({ accessToken: "access-1" });
    expect(server.exchanged.map((form) => form.get("code"))).toEqual(["code-1"]);
  });
});
