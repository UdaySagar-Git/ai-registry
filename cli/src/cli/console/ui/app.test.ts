import { EventEmitter } from "node:events";
import { stripVTControlCharacters } from "node:util";
import { render } from "ink";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AccountRow, ConsoleState } from "#core/console/model.ts";
import type { HostCommandContext } from "#core/host/extend.ts";
import { App } from "./app.ts";

const account: AccountRow = {
  id: "acc_1",
  registry: "my-skills",
  address: "file:///srv/git/my-skills.git",
  config: {},
  credentialsFile: undefined,
  signedIn: false,
  signIn: false,
  publishes: false,
  defaultNamespace: undefined,
  artifactCount: 0,
  namespaceCount: 0,
};

const state: ConsoleState = {
  version: "0.0.0",
  account,
  accounts: [account],
  groups: [],
  summary: {
    skillsImported: 0,
    skillsExamined: 0,
    failed: 0,
    edited: 0,
    dangling: 0,
    missing: 0,
    pending: 0,
    imported: 0,
    unpublished: 0,
    duplicate: 0,
  },
  jobs: [],
  runs: [],
  daemon: { running: false, pid: undefined, jobsEnabled: 0, jobsTotal: 0 },
  policy: undefined,
  scope: "user",
  root: "/nowhere",
  readAtMs: 0,
  problems: [],
  panels: {},
};

/** A terminal of this size after these keys, and the last frame Ink drew on it. */
async function screen(rows: number, columns: number, keys: string[] = []): Promise<string[]> {
  const writes: string[] = [];
  const stdout = Object.assign(new EventEmitter(), {
    columns,
    rows,
    isTTY: true,
    write: (chunk: string) => writes.push(chunk),
  });
  const typed = [...keys];
  const stdin = Object.assign(new EventEmitter(), {
    isTTY: true,
    setRawMode() {},
    setEncoding() {},
    ref() {},
    unref() {},
    read: () => typed.shift() ?? null,
  });
  const instance = render(
    createElement(App, {
      context: {} as HostCommandContext,
      initial: state,
      panels: [],
      upstream: undefined,
      viewer: undefined,
    }),
    {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    },
  );
  if (keys.length > 0) {
    const drawn = writes.length;
    stdin.emit("readable");
    // Ink redraws once it has read the keys, so a frame after that shows them handled.
    await vi.waitFor(() => {
      if (typed.length > 0 || writes.length === drawn) throw new Error("keys not handled yet");
    });
  }
  instance.unmount();
  // The mouse switches write to the same stream; a frame is what names the tabs.
  const frame = writes.findLast((chunk) => chunk.includes("Overview")) ?? "";
  return stripVTControlCharacters(frame).split("\n");
}

describe("App", () => {
  // Ink writes a newline after every frame, so a frame as tall as the terminal
  // scrolls it by one row and the header leaves the screen.
  it("leaves the last row free so the header stays on screen", async () => {
    const lines = await screen(24, 100);
    expect(lines).toHaveLength(23);
    expect(lines[0]).toMatch(/^◆ aireg console /);
    expect(lines.at(-1)).toMatch(/v0\.0\.0$/);
  });

  it("says there are no runs yet rather than leaving the section blank", async () => {
    const lines = await screen(30, 100);
    const recent = lines.findIndex((line) => line.startsWith("RECENT"));
    expect(lines[recent + 1]?.trim()).toBe("No runs yet.");
  });

  it("keeps the header and footer when an overlay is taller than the screen", async () => {
    const lines = await screen(24, 100, ["?"]);
    expect(lines).toHaveLength(23);
    expect(lines.join("\n")).toContain("previous or next view");
    expect(lines[0]).toMatch(/^◆ aireg console /);
    expect(lines[1]).toMatch(/^─+$/);
    expect(lines[2]).toMatch(/^my-skills \[1\] /);
    expect(lines[3]).toMatch(/^─+$/);
    expect(lines[4]).toContain("Overview");
    expect(lines.at(-1)).toMatch(/v0\.0\.0$/);
  });
});
