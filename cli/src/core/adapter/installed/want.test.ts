import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltinAdapter } from "#core/adapter/registry.ts";
import { AiregError } from "#core/errors.ts";
import { isTrusted, parseAdapterId, parseWant } from "./want.ts";

// The built-in ids are the ones the composition root registers.
beforeAll(() => {
  registerBuiltinAdapter("git", async () => ({}));
  registerBuiltinAdapter("local", async () => ({}));
});

describe("parseWant", () => {
  it("reads an id, and an exact pin", () => {
    expect(parseWant("acme")).toEqual({ id: "acme", version: undefined });
    expect(parseWant("Acme@1.4.0")).toEqual({ id: "acme", version: "1.4.0" });
  });

  it("refuses a path-shaped id, a built-in id, or a v-prefixed pin", () => {
    expect(() => parseWant("../etc")).toThrow(AiregError);
    expect(() => parseWant("git")).toThrow(/built into aireg/);
    expect(() => parseWant("local@1.0.0")).toThrow(/built into aireg/);
    expect(() => parseWant("acme@v1.4.0")).toThrow(/is not an exact version/);
  });
});

describe("isTrusted", () => {
  it("trusts only the listed adapters; any other id is asked about, not refused", () => {
    expect(isTrusted("acme")).toBe(false);
    expect(parseWant("acme").id).toBe("acme");
  });
});

describe("parseAdapterId", () => {
  it("lowercases an id and leaves refusing a built-in one to the caller", () => {
    expect(parseAdapterId("Git")).toBe("git");
  });
});
