import { describe, expect, it } from "vitest";
import { withLine } from "./overlays.ts";

describe("withLine", () => {
  it("keeps only what the activity panel can show, newest last", () => {
    let lines: string[] = [];
    for (let index = 0; index < 1_000; index += 1) lines = withLine(lines, `line ${index}`);
    expect(lines).toHaveLength(16);
    expect(lines[0]).toBe("line 984");
    expect(lines.at(-1)).toBe("line 999");
  });
});
