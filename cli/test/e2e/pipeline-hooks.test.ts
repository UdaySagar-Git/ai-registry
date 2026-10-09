import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect } from "vitest";
import { emptyRegistryConfig } from "#core/config/model.ts";
import { formatConfig } from "#core/config/parse.ts";
import { registry } from "#test/kit/builders/registry.ts";
import { test as base } from "#test/kit/fixtures.ts";

const test = base.extend("kit", async ({ home, tmp }) => {
  await mkdir(join(home.aireg, "hooks"), { recursive: true, mode: 0o700 });
  return registry(join(tmp, "kit")).skill("kit/lint@1.0.0", { description: "Lint it." }).write();
});

describe("pipeline hooks on the real CLI", () => {
  test("reports a preConnect handler that rejects registry show as invalid", async ({
    aireg,
    home: { aireg: toolHome },
    kit,
  }) => {
    await writeFile(
      join(toolHome, "hooks", "gate.mjs"),
      "export default () => { throw new Error('blocked'); };\n",
      "utf8",
    );
    await writeFile(
      join(toolHome, "config.yml"),
      formatConfig({
        ...emptyRegistryConfig(),
        hooks: [{ id: "gate", stage: "preConnect", handler: "hooks/gate.mjs" }],
      }),
      "utf8",
    );

    const ran = await aireg(["registry", "show", kit, "--json"], { cwd: kit });
    expect(ran.code).not.toBe(0);
    expect(JSON.parse(ran.stdout)).toEqual({
      ok: false,
      error: { code: "invalid", message: "gate rejected preConnect: blocked", adapter: "hooks" },
    });
  }, 30_000);

  test("fires a matched prePlan hook during add", async ({
    aireg,
    home: { aireg: toolHome },
    kit,
  }) => {
    const log = join(toolHome, "plan.txt");
    await writeFile(
      join(toolHome, "hooks", "plan.mjs"),
      `import { appendFileSync } from "node:fs";
export default (event) => appendFileSync(${JSON.stringify(log)}, event.stage + ":" + (event.aliases ?? []).join(",") + "\\n");`,
      "utf8",
    );
    await writeFile(
      join(toolHome, "config.yml"),
      formatConfig({
        ...emptyRegistryConfig(),
        hooks: [{ id: "plan", stage: "prePlan", handler: "hooks/plan.mjs", matcher: "kit" }],
      }),
      "utf8",
    );
    const ran = await aireg(["add", kit, "--all", "-g", "-y", "--dry-run"], { cwd: kit });
    expect(ran.code).toBe(0);
    expect(await readFile(log, "utf8")).toBe("prePlan:kit\n");
  }, 30_000);
});
