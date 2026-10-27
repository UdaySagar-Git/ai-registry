import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, vi } from "vitest";
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
  await writeFile(
    module,
    `import { appendFile } from "node:fs/promises";
export default {
  id: "rotating", displayName: "Rotating", protocol: 1, artifactKinds: ["skill"],
  dispatch: { hosts: ["registry.acme.example"] },
  capabilities: { pinsSource: false, auth: true },
  auth: {
    login: async () => ({ credential: { type: "bearer", accessToken: "unused" } }),
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

describe("AccountService", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("spends a refresh token once when two callers refresh at the same time", async ({ tmp }) => {
    vi.stubEnv("AIREG_HOME", tmp);
    vi.stubEnv("AIREG_USER_SCOPE", tmp);
    const account = { id: "acc_one", registry: "acme" };
    await writeFile(
      join(tmp, "manifest.yml"),
      `registries:\n  acme:\n    source: ${ENDPOINT}\n    adapter: rotating\n`,
    );
    await writeConfig(
      {
        ...emptyRegistryConfig(),
        adapters: { rotating: await rotating(tmp) },
        accounts: [account],
      },
      0,
    );
    await saveCredential(account.id, {
      origin: ENDPOINT,
      credential: { type: "bearer", accessToken: "a1", refreshToken: "r1", expiresAtMs: 0 },
    });

    const service = new AccountService();
    const signal = new AbortController().signal;
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
