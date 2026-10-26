import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect } from "vitest";
import { fileTest as test } from "#test/kit/fixtures.ts";

let root: string;

test.beforeAll(({ tmp }) => {
  root = tmp;
});

describe("authoring versions in a registry", () => {
  const authored = () => join(root, "authored");
  const eng = () => join(authored(), "artifacts", "eng");
  const ship = (...rest: string[]) => join(eng(), "skill", "ship", ...rest);
  const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));

  test("keeps latest on the highest version when a lower one is indexed after it", async ({
    aireg,
  }) => {
    const init = ["registry", "init", authored(), "--name", "authored", "--namespace", "eng"];
    expect((await aireg([...init, "-y"], { cwd: root })).code).toBe(0);
    expect((await aireg(["skill", "new", "ship"], { cwd: eng() })).code).toBe(0);
    await writeFile(ship("0.1.0", "SKILL.md"), "---\nname: ship\ndescription: Ship it.\n---\n");
    expect((await aireg(["skill", "bump", "ship", "major"], { cwd: eng() })).code).toBe(0);
    expect((await aireg(["registry", "index"], { cwd: authored() })).code).toBe(0);

    expect((await aireg(["skill", "bump", "ship", "0.1.1"], { cwd: eng() })).code).toBe(0);
    expect((await aireg(["registry", "index"], { cwd: authored() })).code).toBe(0);
    expect((await json(ship("versions.json"))).latest).toBe("1.0.0");
    expect((await json(join(authored(), "index.json"))).entries[0].latest).toBe("1.0.0");

    const versions = await json(ship("versions.json"));
    for (const row of versions.versions) row.status = "deprecated";
    await writeFile(ship("versions.json"), `${JSON.stringify(versions, null, 2)}\n`);
    const indexed = await aireg(["registry", "index"], { cwd: authored() });
    expect(indexed.stdout).toContain("Updated index.json. No new versions.");
  });

  test("writes a bump to a v-prefixed version as the bare version", async ({ aireg }) => {
    const bumped = await aireg(["skill", "bump", "ship", "v2.0.0"], { cwd: eng() });
    expect(bumped.code, bumped.stderr).toBe(0);
    expect(existsSync(ship("2.0.0"))).toBe(true);
    expect(existsSync(ship("v2.0.0"))).toBe(false);
  });

  test("names the namespace in the hint for a missing artifact, unless you are in it", async ({
    aireg,
  }) => {
    const outside = await aireg(["skill", "bump", "absent"], { cwd: authored() });
    expect(outside.stderr).toContain("`aireg skill new absent --namespace <namespace>`");
    const named = await aireg(["skill", "bump", "absent", "--namespace", "eng"], {
      cwd: authored(),
    });
    expect(named.stderr).toContain("`aireg skill new absent --namespace eng`");
    const inside = await aireg(["skill", "bump", "absent"], { cwd: eng() });
    expect(inside.stderr).toContain("`aireg skill new absent`.");
    const climbing = await aireg(["skill", "bump", "../../ship"], { cwd: eng() });
    expect(climbing.code).toBe(2);
    expect(climbing.stderr).toContain("is not a valid artifact name");
  });

  test("renames the copy new --from --name makes, so it indexes", async ({ aireg }) => {
    const source = join(root, "hello");
    await mkdir(source, { recursive: true });
    const text = "---\n# kept\nname: hello\ndescription: Say hello.\n---\n\nSay hello.\n";
    await writeFile(join(source, "SKILL.md"), text);
    const from = ["skill", "new", "--from", source, "--name", "greet", "--namespace", "eng", "-y"];
    const copied = await aireg(from, { cwd: authored() });
    expect(copied.code, copied.stderr).toBe(0);
    const greet = join(eng(), "skill", "greet", "0.1.0", "SKILL.md");
    expect(await readFile(greet, "utf8")).toBe(text.replace("name: hello", "name: greet"));
    expect(await readFile(join(source, "SKILL.md"), "utf8")).toBe(text);
    expect((await aireg(["registry", "index"], { cwd: authored() })).code).toBe(0);
  });

  test("keeps an agent's dependencies through a bump, and checks they exist", async ({ aireg }) => {
    const agent = (version: string, ...rest: string[]) =>
      join(eng(), "agent", "planner", version, ...rest);
    await mkdir(agent("0.1.0"), { recursive: true });
    await writeFile(
      agent("0.1.0", "AGENT.md"),
      "---\nname: planner\ndescription: Plans a release.\n---\n\nPlan it.\n",
    );
    const needs = (to: string) =>
      JSON.stringify({ relationships: [{ rel_type: "depends_on", to }] });
    await writeFile(agent("0.1.0", "artifact.json"), needs("eng/skill/ship@1.0.0"));
    expect((await aireg(["registry", "index"], { cwd: authored() })).code).toBe(0);
    const edge = { rel_type: "depends_on", to: "eng/skill/ship@1.0.0" };
    expect((await json(agent("0.1.0", "artifact.json"))).relationships).toEqual([edge]);

    const bumped = await aireg(["agent", "bump", "planner"], { cwd: eng() });
    expect(bumped.stdout).toMatch(/1 relationship from 0\.1\.0/);
    expect((await aireg(["registry", "index"], { cwd: authored() })).code).toBe(0);
    expect((await json(agent("0.1.1", "artifact.json"))).relationships).toEqual([edge]);

    expect((await aireg(["agent", "bump", "planner"], { cwd: eng() })).code).toBe(0);
    await writeFile(agent("0.1.2", "artifact.json"), needs("eng/skill/ship@9.9.9"));
    const checked = await aireg(["registry", "validate"], { cwd: authored() });
    expect(checked.code).toBe(1);
    expect(checked.stdout).toContain(
      "depends on eng/skill/ship@9.9.9, which this registry does not hold",
    );
  });

  test("keeps a file the blob store holds through a bump", async ({ aireg }) => {
    const acme = join(root, "acme");
    await cp(join(import.meta.dirname, "../../../examples/acme-registry"), acme, {
      recursive: true,
    });
    const bumped = await aireg(["skill", "bump", "pr-review", "--namespace", "engineering"], {
      cwd: acme,
    });
    expect(bumped.stdout).toContain("1 blob-backed file from 1.2.0, in artifact.json");
    expect((await aireg(["registry", "index"], { cwd: acme })).code).toBe(0);
    const at = join(acme, "artifacts", "engineering", "skill", "pr-review", "1.2.1");
    const files = (await json(join(at, "artifact.json"))).files as { path: string }[];
    expect(files.map((file) => file.path)).toContain("assets/rubric.json");
    expect((await aireg(["registry", "validate"], { cwd: acme })).code).toBe(0);
  });

  test("refuses a name Windows reserves for a device, from new, validate and index", async ({
    aireg,
  }) => {
    const refused = await aireg(["skill", "new", "con"], { cwd: eng() });
    expect(refused.code).toBe(2);
    expect(refused.stderr).toContain('"con" is a device name on Windows.');

    const made = join(eng(), "skill", "lpt9", "0.1.0");
    await mkdir(made, { recursive: true });
    await writeFile(join(made, "SKILL.md"), "---\nname: lpt9\ndescription: Print.\n---\n");
    for (const action of ["validate", "index"]) {
      const ran = await aireg(["registry", action], { cwd: authored() });
      expect(ran.code, action).toBe(1);
      expect(ran.stdout + ran.stderr, action).toContain('"lpt9" is a device name on Windows');
    }
    await rm(join(eng(), "skill", "lpt9"), { recursive: true });
  });
});
