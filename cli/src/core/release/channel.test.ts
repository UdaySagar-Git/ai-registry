import { describe, expect, it } from "vitest";
import { needsMinimumUpdate } from "./channel.ts";

describe("needsMinimumUpdate", () => {
  it("asks for an update only below the floor", () => {
    expect(needsMinimumUpdate("0.1.0", undefined)).toBe(false);
    expect(needsMinimumUpdate("0.1.0", "0.1.0")).toBe(false);
    expect(needsMinimumUpdate("0.1.1", "0.1.0")).toBe(false);
    expect(needsMinimumUpdate("0.0.9", "0.1.0")).toBe(true);
  });
});
