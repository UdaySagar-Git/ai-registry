import { expect, test } from "vitest";
import { pollUntil } from "./poll.ts";

test("answers true as soon as the check holds", async () => {
  let calls = 0;
  expect(await pollUntil(() => ++calls === 3, 1_000, 1)).toBe(true);
  expect(calls).toBe(3);
});

test("answers false once the time runs out", async () => {
  expect(await pollUntil(() => false, 20, 5)).toBe(false);
});
