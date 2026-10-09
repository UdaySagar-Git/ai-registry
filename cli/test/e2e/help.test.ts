import { describe, expect } from "vitest";
import { COMMANDS } from "#cli/commands/index.ts";
import { test } from "#test/kit/fixtures.ts";

// Regenerate with `vitest run --project e2e -u` after a deliberate change to help text.
describe("aireg --help", () => {
  test("lists the commands and examples", async ({ aireg, redact }) => {
    const ran = await aireg(["--help"]);
    expect(ran.code, ran.stderr).toBe(0);
    await expect(redact(ran.stdout + ran.stderr)).toMatchFileSnapshot(
      "__snapshots__/help/aireg.txt",
    );
  });
});

/** The built-in commands, and the skill and agent commands every scope has outside a registry. */
const PAGES: string[] = [
  ...COMMANDS.flatMap((command) => [
    command.name,
    ...(command.actions ?? []).map((action) => `${command.name} ${action.name}`),
  ]),
  ...["skill", "agent"].flatMap((kind) => [kind, `${kind} new`, `${kind} bump`]),
];

describe("aireg <command> [<action>] --help", () => {
  test.for(PAGES)("%s", async (page, { aireg, redact }) => {
    const ran = await aireg([...page.split(" "), "--help"]);
    expect(ran.code, ran.stderr).toBe(0);
    await expect(redact(ran.stdout + ran.stderr)).toMatchFileSnapshot(
      `__snapshots__/help/${page.replace(" ", "/")}.txt`,
    );
  });
});
