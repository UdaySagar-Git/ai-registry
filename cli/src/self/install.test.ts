import { mkdir, readlink, symlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect } from "vitest";
import { test } from "#test/kit/fixtures.ts";
import { previousInstalled, rollback, versionsToPrune } from "./install.ts";

describe("versionsToPrune", () => {
  test("drops the oldest after keeping n newest", () => {
    expect(versionsToPrune(["0.1.0", "0.3.0", "0.2.0"], 2)).toEqual(["0.1.0"]);
  });
});

describe("rollback", () => {
  test("points current at the newest version that is not current", async ({ tmp }) => {
    const home = tmp;
    const env = { AIREG_HOME: home };
    const cli = join(home, "cli");
    await mkdir(join(cli, "0.1.0"), { recursive: true });
    await mkdir(join(cli, "0.2.0"), { recursive: true });
    await mkdir(join(cli, "0.3.0"), { recursive: true });
    await symlink("0.3.0", join(cli, "current"));
    expect(await previousInstalled(env)).toBe("0.2.0");
    expect(await rollback(env)).toBe("0.2.0");
    expect(await readlink(join(cli, "current"))).toBe("0.2.0");
  });

  test("says there is nothing to roll back to before any update", async ({ tmp }) => {
    const home = tmp;
    await expect(rollback({ AIREG_HOME: home })).rejects.toMatchObject({
      name: "AiregError",
      message: "No earlier version of aireg is installed to roll back to.",
    });
  });
});
