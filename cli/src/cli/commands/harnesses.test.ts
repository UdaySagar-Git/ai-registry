import { join } from "node:path";
import { afterEach, describe, expect, vi } from "vitest";
import { Printer } from "#core/output.ts";
import { test } from "#test/kit/fixtures.ts";
import { foundSummary, run } from "./harnesses.ts";
import type { CommandContext } from "./index.ts";

function context(cwd: string, writes: string[]): CommandContext {
  return {
    argv: [],
    cwd,
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

describe("harnesses", () => {
  let cwd: string;

  test.beforeEach(async ({ tmp }) => {
    cwd = tmp;
    vi.stubEnv("HOME", cwd);
    vi.stubEnv("PATH", "");
    vi.stubEnv("CLAUDE_CONFIG_DIR", join(cwd, ".claude"));
    vi.stubEnv("CODEX_HOME", "");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
  });

  test("lists every name --for takes, by name and detection only", async () => {
    const writes: string[] = [];
    await run(context(cwd, writes));
    const payload = JSON.parse(writes.join("")) as {
      data: { harnesses: Record<string, unknown>[] };
    };
    // In the order the text lists them, with the shared folder last.
    expect(payload.data.harnesses).toEqual([
      { name: "claude", displayName: "Claude Code", shared: false, detected: true, by: "env" },
      { name: "codex", displayName: "Codex", shared: false, detected: false },
      { name: "cursor", displayName: "Cursor", shared: false, detected: false },
      { name: "agents", displayName: "Shared .agents folder", shared: true, detected: false },
    ]);
  });

  test("sums up how many of the supported harnesses this machine has", () => {
    expect(foundSummary(3, 3)).toBe("Found all 3 supported harnesses on this machine.");
    expect(foundSummary(1, 3)).toBe("Found 1 of 3 supported harnesses on this machine.");
    expect(foundSummary(0, 3)).toBe("No supported harness found on this machine.");
  });
});
