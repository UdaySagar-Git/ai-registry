import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIN_NODE, nodeTooOld } from "./version.ts";

describe("nodeTooOld", () => {
  it("accepts 22.20 and refuses older", () => {
    expect(nodeTooOld("22.20.0")).toBeUndefined();
    expect(nodeTooOld("22.20.1")).toBeUndefined();
    expect(nodeTooOld("24.0.0")).toBeUndefined();
    expect(nodeTooOld("22.19.9")).toMatch(/22\.20\.0/);
    expect(nodeTooOld("21.0.0")).toMatch(/22\.20\.0/);
  });

  it("holds the same floor as the package's engines field", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { engines: { node: string } };
    expect(manifest.engines.node).toBe(`>=${MIN_NODE}`);
  });
});
