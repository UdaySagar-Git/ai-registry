import { mkdir, mkdtemp, realpath, symlink } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { test } from "#test/kit/fixtures.ts";
import { canonical } from "./canonical.ts";

/** This test's folder, which the kit removes after it. */
let scratch: string;
test.beforeEach(({ tmp }) => {
  scratch = tmp;
});
test("resolves a directory reached through a link to where it really is", async () => {
  const root = await mkdtemp(join(scratch, "aireg-canonical-"));
  await mkdir(join(root, "real"));
  await symlink(join(root, "real"), join(root, "via"));

  expect(canonical(join(root, "via"))).toBe(await realpath(join(root, "real")));
});

test("leaves a path that does not exist as written", () => {
  expect(canonical("/nowhere/at/all")).toBe("/nowhere/at/all");
});
