import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, vi } from "vitest";
import { test } from "#test/kit/fixtures.ts";
import { offerFrom } from "./offer.ts";

const reads = vi.hoisted(() => ({ active: 0, peak: 0 }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: async (...args: Parameters<typeof actual.readFile>) => {
      reads.active += 1;
      reads.peak = Math.max(reads.peak, reads.active);
      try {
        await new Promise((settle) => setTimeout(settle, 1));
        return await actual.readFile(...args);
      } finally {
        reads.active -= 1;
      }
    },
  };
});

let root: string;

test.beforeEach(async ({ tmp }) => {
  root = tmp;
  reads.peak = 0;
});

describe("offerFrom", () => {
  test("reads a large tree a bounded number of files at a time", async () => {
    const skill = join(root, "lint");
    await mkdir(join(skill, "assets"), { recursive: true });
    await writeFile(join(skill, "SKILL.md"), "---\nname: lint\ndescription: Lints.\n---\n");
    await Promise.all(
      Array.from({ length: 300 }, (_, index) =>
        writeFile(join(skill, "assets", `${index}.txt`), `asset ${index}`),
      ),
    );

    const { input } = await offerFrom(skill, { name: "lint", kind: "skill", version: "1.0.0" });
    expect(input.files).toHaveLength(301);
    // Unbounded, all 301 reads would be in flight together; macOS allows 256 descriptors.
    expect(reads.peak).toBeLessThanOrEqual(16);
  });
});
