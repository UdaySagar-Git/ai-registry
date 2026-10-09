import { describe, expect, it } from "vitest";
import { AiregError, ErrorCode } from "#core/errors.ts";
import { withReleaseHint } from "./errors.ts";

describe("withReleaseHint", () => {
  it("keeps a release failure's code and adds the hint", () => {
    const failure = new AiregError("Bad checksum.", { code: ErrorCode.Integrity });
    expect(withReleaseHint(failure, "Check the keys.")).toMatchObject({
      message: "Bad checksum.",
      code: ErrorCode.Integrity,
      hint: "Check the keys.",
    });
  });

  it("passes through a failure that already says what to do, or is not a release check", () => {
    const hinted = new AiregError("No version.", { code: ErrorCode.Usage, hint: "Name one." });
    const busy = new AiregError("Busy.", { code: ErrorCode.Busy });
    expect(withReleaseHint(hinted, "Check the keys.")).toBe(hinted);
    expect(withReleaseHint(busy, "Check the keys.")).toBe(busy);
  });

  it("names an unexpected crash as an error with the hint", () => {
    expect(withReleaseHint(new Error("EACCES"), "Check the keys.")).toMatchObject({
      message: "EACCES",
      code: ErrorCode.Error,
      hint: "Check the keys.",
    });
  });
});
