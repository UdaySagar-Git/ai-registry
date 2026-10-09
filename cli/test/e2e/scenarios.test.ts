import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe } from "vitest";
import { test } from "#test/kit/fixtures.ts";
import { runScenario } from "#test/kit/scenario.ts";

const DIR = fileURLToPath(new URL("../scenarios/", import.meta.url));
const SCENARIOS = readdirSync(DIR)
  .filter((name) => name.endsWith(".md") && name !== "README.md")
  .sort();

describe("scenarios", () => {
  test.for(SCENARIOS)("%s", async (name, { tmp, home, project, aireg, redact }) => {
    await runScenario(join(DIR, name), { root: tmp, home: home.dir, project, aireg, redact });
  });
});
