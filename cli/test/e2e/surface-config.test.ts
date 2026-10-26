import { describe, expect } from "vitest";
import { fileTest as test } from "#test/kit/fixtures.ts";

describe("aireg's own settings", () => {
  test("keeps both of two settings written at once", async ({ aireg }) => {
    for (let round = 0; round < 2; round += 1) {
      const namespace = `kit/round-${round}`;
      const [paused, named] = await Promise.all([
        aireg(["config", "set", "paused", round % 2 === 0 ? "true" : "false"]),
        aireg(["config", "set", "defaults.namespace", namespace]),
      ]);
      expect([paused.code, named.code], paused.stderr + named.stderr).toEqual([0, 0]);
      expect((await aireg(["config", "get", "paused"])).stdout.trim()).toBe(
        String(round % 2 === 0),
      );
      expect((await aireg(["config", "get", "defaults.namespace"])).stdout.trim()).toBe(namespace);
    }
    expect((await aireg(["config", "set", "paused", "false"])).code).toBe(0);
  }, 120_000);

  test("reads and writes the default namespace", async ({ aireg }) => {
    expect((await aireg(["config", "set", "defaults.namespace", "kit/team"])).code).toBe(0);
    expect((await aireg(["config", "get", "defaults.namespace"])).stdout.trim()).toBe("kit/team");
    // An address that names no namespace is the guessing this setting prevents.
    const bad = await aireg(["config", "set", "defaults.namespace", "kit"]);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain("takes <registry>/<namespace>");
    expect(bad.stderr).not.toContain("config.yml");
    // The grammar's other refusals are unit tested; this one checks the echo is escaped.
    const refused = await aireg(["config", "set", "defaults.namespace", "kit/te‮am"]);
    expect(refused.code).toBe(2);
    expect(refused.stderr).not.toMatch(/‮am/);
    expect((await aireg(["config", "get", "defaults.namespace"])).stdout.trim()).toBe("kit/team");
  });

  // --json must not reuse the text stringifier, or `paused` comes back as "false" and any
  // `if (data.paused)` is true.
  test("keeps paused a boolean, in --json and on the way in", async ({ aireg }) => {
    const set = await aireg(["config", "set", "paused", "false", "--json"]);
    expect(JSON.parse(set.stdout).data).toEqual({ key: "paused", value: false });
    const bad = await aireg(["config", "set", "paused", "yes"]);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain('`paused` takes true or false, not "yes".');

    const [listed, got, text] = await Promise.all([
      aireg(["config", "list", "--json"]),
      aireg(["config", "get", "paused", "--json"]),
      aireg(["config", "get", "paused"]),
    ]);
    expect(listed.code).toBe(0);
    expect(JSON.parse(listed.stdout).data.paused).toBe(false);
    expect(JSON.parse(got.stdout).data.value).toBe(false);
    // Still a bare word in text, so `$(aireg config get paused)` works.
    expect(text.stdout.trim()).toBe("false");
  });

  test("answers for the daemon without starting it", async ({ aireg }) => {
    const status = await aireg(["daemon", "status"]);
    expect(status.code).toBe(0);
    expect(status.stdout).toContain("Not running");
  });
});

describe("aireg logs", () => {
  test("prints the logs as one JSON document, each entry with its log", async ({ aireg }) => {
    expect((await aireg(["--log-level", "info", "list"])).code).toBe(0);
    const ran = await aireg(["logs", "--cli", "--json"]);
    expect(ran.code, ran.stderr).toBe(0);
    const { data } = JSON.parse(ran.stdout) as { data: { entries: { log: string }[] } };
    expect(data.entries.length).toBeGreaterThan(0);
    expect(new Set(data.entries.map((entry) => entry.log))).toEqual(new Set(["cli"]));
  });

  // As `tail -n 0`: nothing, and no claim that the log is empty.
  test("prints nothing for --tail 0 when there are entries", async ({ aireg }) => {
    expect((await aireg(["--log-level", "info", "list"])).code).toBe(0);
    const [text, json] = await Promise.all([
      aireg(["logs", "--cli", "--tail", "0"]),
      aireg(["logs", "--cli", "--tail", "0", "--json"]),
    ]);
    expect(text.code, text.stderr).toBe(0);
    expect(text.stdout).toBe("");
    expect(JSON.parse(json.stdout)).toEqual({ ok: true, data: { entries: [] } });
  });
});
