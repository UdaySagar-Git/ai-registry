import { describe, expect, test } from "vitest";
import { EMPTY_RUN_COUNTS } from "#core/run/model.ts";
import { runSummary } from "./follow.ts";

describe("runSummary", () => {
  test("says in sync only when nothing was left alone", () => {
    expect(runSummary({ ...EMPTY_RUN_COUNTS, examined: 2 }, "", undefined)).toBe(
      "In sync with every registry (2 artifacts).",
    );
  });

  test("says what it left alone, such as under a policy that is off, rather than in sync", () => {
    expect(runSummary({ ...EMPTY_RUN_COUNTS, examined: 2, skipped: 1 }, "", undefined)).toBe(
      "Checked 2 artifacts: 1 left as it is.",
    );
    expect(
      runSummary({ ...EMPTY_RUN_COUNTS, examined: 3, changed: 1, skipped: 2 }, "acme: ", "acme"),
    ).toBe("acme: Checked 3 artifacts: 1 changed and 2 left as they are.");
  });
});
