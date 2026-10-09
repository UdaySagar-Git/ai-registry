import { describe, expect, it } from "vitest";
import { Printer } from "#core/output.ts";
import { renderStatus } from "./status.ts";

describe("renderStatus", () => {
  it("shows a watched artifact under the harness whose folder it is", () => {
    const lines: string[] = [];
    const sink = { write: (chunk: string) => lines.push(chunk.trimEnd()), isTTY: false };
    const printer = new Printer({ out: sink, err: sink, color: "never" });
    const row = {
      name: "lint",
      shown: "lint",
      kind: "skill",
      registry: "acme",
      address: "",
      ref: "0.1.0",
      pinned: false,
      targets: [],
      watched: { harness: "claude", path: "~/.claude/skills/lint" },
    };
    renderStatus(
      printer,
      [{ name: "lint", state: "ok", detail: undefined, harnesses: {} }],
      [row],
      "user",
    );
    expect(lines).toContain("  lint      skill  0.1.0    acme  watched  ok");
  });
});
