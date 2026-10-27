import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, vi } from "vitest";
import type { Credential } from "#adapter/index.ts";
import { emptyRegistryConfig } from "#core/config/model.ts";
import { writeConfig } from "#core/config/repository.ts";
import { readCredential, saveCredential } from "#core/credentials/store.ts";
import { test } from "#test/kit/fixtures.ts";
import { AccountService } from "./service.ts";

const ENDPOINT = "https://registry.acme.example";

/** Refreshes slowly and counts each refresh token it spends, as a rotating server would. */
async function rotating(home: string): Promise<string> {
  const module = join(home, "rotating.mjs");
  const spent = join(home, "spent");
  const revoked = join(home, "revoked");
  await writeFile(
    module,
    `import { appendFile } from "node:fs/promises";
export default {
  id: "rotating", displayName: "Rotating", protocol: 1, artifactKinds: ["skill"],
  dispatch: { hosts: ["registry.acme.example"] },
  capabilities: { pinsSource: false, auth: true },
  auth: {
    login: async ({ browser }) => ({ credential: browser ?? { type: "bearer", accessToken: "unused" } }),
    revoke: async (endpoint, credential) => {
      if (credential.refreshToken === "unreachable") throw new Error("the registry is down");
      await appendFile(${JSON.stringify(revoked)}, credential.refreshToken + "\\n");
    },
    refresh: async (endpoint, credential) => {
      await appendFile(${JSON.stringify(spent)}, credential.refreshToken + "\\n");
      await new Promise((resolve) => setTimeout(resolve, 200));
      const next = Number(credential.refreshToken.slice(1)) + 1;
      return { type: "bearer", accessToken: "a" + next, refreshToken: "r" + next, expiresAtMs: Date.now() + 900_000 };
    },
  },
  connect: async () => ({ resolve: async () => ({ artifacts: [] }), fetch: async () => new Uint8Array(), close: async () => {} }),
};
`,
  );
  return module;
}

const signal = new AbortController().signal;

/** A home declaring `acme` on the rotating adapter, its account signed in with `stored`. */
async function signedIn(
  tmp: string,
  stored: Credential,
): Promise<{ id: string; registry: string }> {
  vi.stubEnv("AIREG_HOME", tmp);
  vi.stubEnv("AIREG_USER_SCOPE", tmp);
  const account = { id: "acc_one", registry: "acme" };
  await writeFile(
    join(tmp, "manifest.yml"),
    `registries:\n  acme:\n    source: ${ENDPOINT}\n    adapter: rotating\n`,
  );
  await writeConfig(
    { ...emptyRegistryConfig(), adapters: { rotating: await rotating(tmp) }, accounts: [account] },
    0,
  );
  await saveCredential(account.id, { origin: ENDPOINT, credential: stored });
  return account;
}

async function revoked(tmp: string): Promise<string[]> {
  const text = await readFile(join(tmp, "revoked"), "utf8").catch(() => "");
  return text.split("\n").filter(Boolean);
}

describe("AccountService", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("ends the session a second sign-in replaces", async ({ tmp }) => {
    await signedIn(tmp, { type: "bearer", accessToken: "a1", refreshToken: "r1" });
    await new AccountService().login(
      { registry: "acme" },
      { browser: { type: "bearer", accessToken: "a9", refreshToken: "r9" } },
      signal,
    );
    expect(await revoked(tmp)).toEqual(["r1"]);
    expect((await readCredential("acc_one"))?.credential).toMatchObject({ refreshToken: "r9" });
  });

  test("signs out on this machine though the registry cannot be told", async ({ tmp }) => {
    const account = await signedIn(tmp, {
      type: "bearer",
      accessToken: "a1",
      refreshToken: "unreachable",
    });
    await new AccountService().logout(account.id, signal);
    expect(await readCredential(account.id)).toBeUndefined();
  });

  test("a sign-out during a refresh is not undone by it", async ({ tmp }) => {
    const account = await signedIn(tmp, {
      type: "bearer",
      accessToken: "a1",
      refreshToken: "r1",
      expiresAtMs: 0,
    });
    const refreshing = new AccountService().credential(account, ENDPOINT, signal);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await new AccountService().logout(account.id, signal);
    await refreshing;
    expect(await readCredential(account.id)).toBeUndefined();
    expect(await revoked(tmp)).toEqual(["r2"]);
  });

  test("spends a refresh token once when two callers refresh at the same time", async ({ tmp }) => {
    const account = await signedIn(tmp, {
      type: "bearer",
      accessToken: "a1",
      refreshToken: "r1",
      expiresAtMs: 0,
    });

    const service = new AccountService();
    const both = await Promise.all([
      service.credential(account, ENDPOINT, signal),
      new AccountService().credential(account, ENDPOINT, signal),
    ]);

    expect(
      both.map((credential) => credential.type === "bearer" && credential.accessToken),
    ).toEqual(["a2", "a2"]);
    expect(await readFile(join(tmp, "spent"), "utf8")).toBe("r1\n");
    expect((await readCredential(account.id))?.credential).toMatchObject({ refreshToken: "r2" });
  });
});
