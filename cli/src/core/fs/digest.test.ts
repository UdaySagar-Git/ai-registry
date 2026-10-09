import { mkdir, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { test } from "#test/kit/fixtures.ts";
import { digest } from "./digest.ts";

const past = (seconds: number) => new Date(Date.now() - seconds * 1000);

test("sees an edit to a copy it digested before, even one of the same size", async ({ tmp }) => {
  const copy = join(tmp, "copy");
  await mkdir(copy);
  const file = join(copy, "SKILL.md");
  await writeFile(file, "one\n");
  await utimes(file, past(60), past(60));
  const before = await digest(copy);
  expect(await digest(copy)).toBe(before);

  await writeFile(file, "two\n");
  await utimes(file, past(30), past(30));
  expect(await digest(copy)).not.toBe(before);
});
