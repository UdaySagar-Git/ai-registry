import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { describe, expect } from "vitest";
import { test as base } from "#test/kit/fixtures.ts";

const ORIGIN = "https://registry.acme.example";

/** A sign-in server that signs anyone in, and an adapter that sends `auth login` to it. */
const test = base.extend("browserSignIn", async ({ home: { dir: home, aireg } }, { onCleanup }) => {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          authorization_endpoint: `${issuer}/oauth/authorize`,
          token_endpoint: `${issuer}/oauth/token`,
        }),
      );
      return;
    }
    if (url.pathname === "/oauth/authorize") {
      const back = new URL(url.searchParams.get("redirect_uri") ?? "");
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      back.searchParams.set("code", "code-1");
      response.writeHead(302, { location: back.href }).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ access_token: "session-1", refresh_token: "refresh-1", expires_in: 900 }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onCleanup(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const adapter = join(home, "browser.mjs");
  await mkdir(aireg, { recursive: true, mode: 0o700 });
  await writeFile(
    adapter,
    `export default {
  id: "browser", displayName: "Browser", protocol: 1, artifactKinds: ["skill"],
  dispatch: { hosts: ["registry.acme.example"] },
  capabilities: { pinsSource: false, auth: true },
  auth: {
    browser: (endpoint, config) => ({ issuer: ${JSON.stringify(issuer)}, clientId: "client-" + config.org }),
    login: async ({ browser, config }) => ({
      credential: { ...browser, accessToken: browser.accessToken + "@" + config.org },
      identity: { name: "jane@acme.example" },
    }),
  },
  connect: async () => ({
    resolve: async () => ({ artifacts: [] }),
    fetch: async () => new Uint8Array(),
    close: async () => {},
  }),
};
`,
  );
  await writeFile(
    join(aireg, "config.yml"),
    `schemaVersion: 1\nrevision: 0\nadapters:\n  browser: ${adapter}\naccounts: []\njobs: []\n`,
  );
  // Stands in for the person: follows the sign-in page's redirect back to aireg.
  const browser = join(home, "browser-open.mjs");
  await writeFile(browser, "#!/usr/bin/env node\nawait fetch(process.argv[2]);\n");
  await chmod(browser, 0o755);
  return { browser };
});

describe("auth login through the browser", () => {
  test.skipIf(process.platform === "win32")(
    "stores the adapter's credential from a browser sign-in, refresh token included",
    async ({ aireg, home, browserSignIn }) => {
      const added = await aireg([
        "registry",
        "add",
        `${ORIGIN}/team`,
        "--as",
        "acme",
        "--adapter",
        "browser",
        "--config",
        "org=acme",
        "-g",
      ]);
      expect(added.code, added.stderr).toBe(0);

      const env = { CI: "", BROWSER: browserSignIn.browser };
      const login = await aireg(["auth", "login", "acme"], { env });
      expect(login.code, login.stderr).toBe(0);
      expect(login.stderr).toMatch(/Opening http:\/\/127\.0\.0\.1:\d+\/oauth\/authorize\?/);
      expect(login.stderr).toContain("client_id=client-acme");
      expect(login.stdout).toContain("Signed in to acme");

      const stored = JSON.parse(await readFile(join(home.aireg, "credentials.json"), "utf8"));
      expect(Object.values(stored.credentials)).toEqual([
        {
          origin: ORIGIN,
          type: "bearer",
          access_token: "session-1@acme",
          refresh_token: "refresh-1",
          expires_at: expect.any(String),
        },
      ]);
    },
  );

  test("never opens the browser in CI, where nobody can sign in", async ({
    aireg,
    browserSignIn,
  }) => {
    await aireg([
      "registry",
      "add",
      `${ORIGIN}/team`,
      "--as",
      "acme",
      "--adapter",
      "browser",
      "-g",
    ]);
    const login = await aireg(["auth", "login", "acme"], {
      env: { CI: "true", BROWSER: browserSignIn.browser },
    });
    expect(login.code).not.toBe(0);
    expect(login.stderr).not.toContain("Opening");
  });
});
