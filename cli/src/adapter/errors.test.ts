import { describe, expect, it } from "vitest";
import { FAILURE_CODES } from "./codes.ts";
import {
  AdapterError,
  adapterProblem,
  FAILURES,
  failureOf,
  isAdapterError,
  isAuthFailure,
  isRetryable,
} from "./errors.ts";
import { problemFromFailure } from "./problem.ts";

/** Same shape, different module identity - what a packed adapter.mjs throws. */
class PackedAdapterError extends Error {
  readonly adapter: string;
  readonly failure: string;

  constructor(adapter: string, failure: string, message: string) {
    super(message);
    this.name = "AdapterError";
    this.adapter = adapter;
    this.failure = failure;
  }
}

describe("isAdapterError", () => {
  it("matches the class and a packed copy the CLI did not construct", () => {
    const local = new AdapterError("acme", "unauthorized", "missing token");
    const packed = new PackedAdapterError("acme", "unauthorized", "missing token");
    expect(isAdapterError(local)).toBe(true);
    expect(isAdapterError(packed)).toBe(true);
    expect(packed instanceof AdapterError).toBe(false);
    expect(isRetryable(new PackedAdapterError("acme", "unavailable", "timeout"))).toBe(true);
    expect(isRetryable(packed)).toBe(false);
  });

  it("rejects a similarly named throw that is not an adapter failure", () => {
    const spoofed = new Error("nope");
    spoofed.name = "AdapterError";
    expect(isAdapterError(spoofed)).toBe(false);
    expect(isAdapterError({ name: "AdapterError", adapter: "acme", failure: "explode" })).toBe(
      false,
    );
  });

  it("recognizes conflict and mints a catalog problem when none was given", () => {
    const error = new AdapterError("acme", "conflict", "already exists");
    expect(isAdapterError(error)).toBe(true);
    expect(error.problem).toEqual(problemFromFailure("conflict", "already exists"));
    expect(error.problem.code).toBe(FAILURE_CODES.conflict);
  });

  it("mints a catalog problem for a packed throw that omitted one", () => {
    const packed = new PackedAdapterError("acme", "unauthorized", "missing token");
    expect(isAdapterError(packed)).toBe(true);
    expect(adapterProblem(packed as unknown as AdapterError)).toEqual(
      problemFromFailure("unauthorized", "missing token"),
    );
  });
});

describe("failureOf", () => {
  it("prefers HTTP status over a free-form origin code", () => {
    expect(failureOf({ code: "token_expired", title: "expired", status: 401 })).toBe(
      "unauthorized",
    );
    expect(failureOf({ code: "anything", title: "taken", status: 409 })).toBe("conflict");
  });
});

describe("isAuthFailure", () => {
  it("is a credential that is missing, refused or not allowed, and nothing else", () => {
    expect(FAILURES.filter(isAuthFailure)).toEqual(["unauthorized", "forbidden"]);
  });
});
