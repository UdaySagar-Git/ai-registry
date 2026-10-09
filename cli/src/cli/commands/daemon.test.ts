import { tmpdir } from "node:os";
import { afterEach, describe, expect, vi } from "vitest";
import { Printer } from "#core/output.ts";
import { test } from "#test/kit/fixtures.ts";
import { daemonAction, run } from "./daemon.ts";
import type { CommandContext } from "./index.ts";

function context(argv: string[], writes: string[]): CommandContext {
  return {
    argv,
    cwd: tmpdir(),
    printer: new Printer({
      format: "json",
      out: { write: (chunk: string) => writes.push(chunk), isTTY: false },
    }),
    host: {
      version: "test",
      connectAccount: async () => {
        throw new Error("no host");
      },
      openRunStore: async () => {
        throw new Error("no host");
      },
    },
  };
}

describe("daemonAction", () => {
  test("takes the first word as the action, and status without one", () => {
    expect(daemonAction(["--json", "stop"])).toBe("stop");
    expect(daemonAction(["autostart", "on"])).toBe("autostart");
    expect(daemonAction(["--verbose"])).toBe("status");
    expect(daemonAction(["--", "start"])).toBe("status");
  });
});

describe("daemon stop", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("says under --json that nothing was running and nothing changed", async ({ tmp }) => {
    const home = tmp;
    vi.stubEnv("AIREG_HOME", home);
    const writes: string[] = [];
    await run(context(["stop"], writes));
    expect(JSON.parse(writes.join("")).data).toEqual({ status: "down", changed: false });
  });
});

describe("daemon autostart", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("reports off for a home that never registered", async ({ tmp }) => {
    const home = tmp;
    vi.stubEnv("AIREG_HOME", home);
    const writes: string[] = [];
    await run(context(["autostart"], writes));
    const data = JSON.parse(writes.join("")).data;
    if (["darwin", "linux", "win32"].includes(process.platform)) {
      expect(data).toMatchObject({ supported: true, registered: false, loaded: false });
    } else {
      expect(data).toEqual({ supported: false });
    }
  });

  test("rejects an unknown action as a usage error", async () => {
    await expect(run(context(["autostart", "sometimes"], []))).rejects.toMatchObject({
      code: "usage",
      hint: "Use on, off or status.",
    });
  });
});
