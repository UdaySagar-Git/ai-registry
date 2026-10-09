import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { test } from "#test/kit/fixtures.ts";
import { readJson, SpecError } from "./documents.ts";
import { rootReader } from "./folder.ts";

test("reads a JSON document inside the registry, and nothing for a missing one", async ({
  tmp,
}) => {
  await writeFile(join(tmp, "index.json"), '{"artifacts":[]}');
  const read = rootReader(tmp);
  expect(await readJson(read, "index.json")).toEqual({ artifacts: [] });
  expect(await readJson(read, "artifacts/none/versions.json")).toBeUndefined();
});

test("refuses a document reached through a link out of the registry", async ({ tmp }) => {
  const root = join(tmp, "registry");
  await mkdir(join(root, "artifacts", "acme"), { recursive: true });
  await writeFile(join(tmp, "elsewhere.json"), '{"secret":true}');
  await symlink(join(tmp, "elsewhere.json"), join(root, "artifacts", "acme", "versions.json"));
  await expect(readJson(rootReader(root), "artifacts/acme/versions.json")).rejects.toThrow(
    /versions\.json/,
  );
});

test("refuses a path that climbs out of the root before reading anything", async ({ tmp }) => {
  await expect(rootReader(tmp)("../index.json")).rejects.toBeInstanceOf(SpecError);
});
