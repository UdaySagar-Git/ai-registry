import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { test } from "#test/kit/fixtures.ts";
import { outputContract } from "./kit.ts";

const contract = outputContract("show");

const ACME = fileURLToPath(new URL("../../../../examples/acme-registry", import.meta.url));

test("show prints an artifact and a folder as its schema describes", async ({ aireg }) => {
  expect((await aireg(["registry", "add", ACME, "--as", "acme"])).code).toBe(0);
  const artifact = ["show", "acme/engineering/pr-review"];
  expect(await contract.violations(aireg, artifact, "show")).toBe("");
  const folder = join(ACME, "artifacts", "engineering", "skill", "pr-review", "1.2.0");
  expect(await contract.violations(aireg, ["show", folder], "show")).toBe("");
  expect(contract.unchecked()).toEqual([]);
});
