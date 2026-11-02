import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { type Aireg, test } from "#test/kit/fixtures.ts";

const ACME = join(import.meta.dirname, "..", "..", "..", "examples", "acme-registry");

async function runJob(aireg: Aireg, job: string): Promise<string | undefined> {
  const started = await aireg(["job", "start", job, "--json"]);
  expect(started.code, started.stderr).toBe(0);
  const run = started.json<{ run: { id: string } }>().data?.run.id ?? "";
  await aireg(["job", "runs", run, "--follow"]);
  const ended = await aireg(["job", "runs", run, "--json"]);
  return ended.json<{ run: { state: string } }>().data?.run.state;
}

test("keeps syncing a project that watches a folder beside it", async ({ aireg, project, tmp }) => {
  await cp(ACME, join(tmp, "registry"), { recursive: true });
  const skill = join(tmp, "src", "skills", "hello");
  await mkdir(skill, { recursive: true });
  await writeFile(join(skill, "SKILL.md"), "---\nname: hello\ndescription: Says hello.\n---\nHi\n");
  expect((await aireg(["init", "-y"])).code).toBe(0);
  expect((await aireg(["registry", "add", join(tmp, "registry"), "--as", "acme"])).code).toBe(0);
  const added = await aireg([
    "watch",
    "add",
    "../src/skills",
    "--to",
    "acme/engineering",
    "--json",
  ]);
  expect(added.code, added.stderr).toBe(0);
  const job = added.json<{ job: { id: string } }>().data?.job.id ?? "";

  expect(await runJob(aireg, job)).toBe("succeeded");
  // The first run records the folder in the lock; the second has to read it back.
  expect(await runJob(aireg, job)).toBe("succeeded");
  const status = await aireg(["status", "--json"], { cwd: project });
  expect(status.code, status.stderr).toBe(0);
});
