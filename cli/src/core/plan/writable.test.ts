import { accessSync, chmodSync, constants, mkdtempSync, rmSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect } from "vitest";
import { emptyPlan } from "#test/kit/builders/plan.ts";
import { test } from "#test/kit/fixtures.ts";
import type { Plan } from "./model.ts";
import { blockedTargets } from "./writable.ts";

let home: string;

test.beforeEach(async ({ tmp }) => {
  home = tmp;
});

function planning(links: readonly { harness: string; to: string }[]): Plan {
  return {
    ...emptyPlan(),
    actions: links.map(({ harness, to }) => ({
      kind: "link" as const,
      name: "lint",
      harness,
      from: join(home, "from"),
      to,
      copy: false,
    })),
  };
}

/**
 * Root, or a capability such as CAP_DAC_OVERRIDE, ignores mode bits, so a write test
 * would pass for the wrong reason. Probed rather than read from the uid, which misses the latter.
 */
const modesIgnored = (() => {
  const probe = mkdtempSync(join(tmpdir(), "aireg-modes-"));
  try {
    chmodSync(probe, 0o555);
    accessSync(probe, constants.W_OK);
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
})();

describe("blockedTargets", () => {
  test.skipIf(modesIgnored)("names a harness whose root cannot be written into", async () => {
    const root = join(home, ".cursor");
    await mkdir(root);
    await chmod(root, 0o555);

    const blocked = await blockedTargets(
      planning([{ harness: "cursor", to: join(root, "skills", "lint") }]),
    );

    expect(blocked).toEqual([{ harness: "cursor", path: root }]);
  });

  test("is empty when the parents do not exist yet under a writable directory", async () => {
    // The ordinary case: ~/.pi/agent/skills is created by the apply, and its
    // absence must not read as a problem.
    const blocked = await blockedTargets(
      planning([{ harness: "pi", to: join(home, ".pi", "agent", "skills", "lint") }]),
    );

    expect(blocked).toEqual([]);
  });

  test("names a harness whose root is a file, which no directory can be made in", async () => {
    const root = join(home, ".cursor");
    await writeFile(root, "not a directory\n");

    const blocked = await blockedTargets(
      planning([{ harness: "cursor", to: join(root, "skills", "lint") }]),
    );

    expect(blocked).toEqual([{ harness: "cursor", path: root }]);
  });

  test.skipIf(modesIgnored)("checks a harness once, however many artifacts it takes", async () => {
    const root = join(home, ".cursor");
    await mkdir(root);
    await chmod(root, 0o555);

    const blocked = await blockedTargets(
      planning([
        { harness: "cursor", to: join(root, "skills", "lint") },
        { harness: "cursor", to: join(root, "skills", "review") },
      ]),
    );

    expect(blocked).toHaveLength(1);
  });
});
