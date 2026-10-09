import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect } from "vitest";
import { test } from "#test/kit/fixtures.ts";
import { attempts } from "./transport.ts";
import { parseSource } from "./url.ts";

/** A PATH with a `gh` on it, so the ladder offers the gh rung where it may. */
async function withGh(tmp: string): Promise<NodeJS.ProcessEnv> {
  const bin = join(tmp, "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, "gh"), "#!/bin/sh\nexit 1\n");
  await chmod(join(bin, "gh"), 0o755);
  return { PATH: bin };
}

describe("the clone ladder", () => {
  test("asks gh for a repository on github.com", async ({ tmp }) => {
    const env = await withGh(tmp);
    const labels = attempts(parseSource("https://github.com/acme/kit"), env).map((a) => a.label);
    expect(labels).toEqual(["https", "gh", "ssh"]);
  });

  test("never asks gh, which reads github.com, for a repository on another host", async ({
    tmp,
  }) => {
    const env = await withGh(tmp);
    const ladder = attempts(parseSource("https://git.example.com/acme/kit"), env);
    expect(ladder.map((a) => a.label)).toEqual(["https", "ssh"]);
  });

  test("never hands gh an owner it would read as a flag", async ({ tmp }) => {
    const env = await withGh(tmp);
    const ladder = attempts(parseSource("https://github.com/-uevil/kit"), env);
    expect(ladder.map((a) => a.label)).toEqual(["https", "ssh"]);
  });
});
