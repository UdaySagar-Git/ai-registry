import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, vi } from "vitest";
import { fakeExec } from "#test/kit/fake-exec.ts";
import { test } from "#test/kit/fixtures.ts";
import {
  autostartState,
  disableAutostart,
  enableAutostart,
  serviceSpec,
  startManaged,
} from "./index.ts";

const unix = describe.skipIf(process.platform === "win32");

unix("autostart", () => {
  // The account's defaults: aireg's home and the config folder both follow HOME.
  test.beforeEach(({ home: _ }) => {
    vi.stubEnv("AIREG_HOME", "");
    vi.stubEnv("XDG_CONFIG_HOME", "");
    vi.stubEnv("PATH", "/opt/tools/bin:/usr/bin:/bin");
  });

  describe("serviceSpec", () => {
    test("names the shim rather than a versioned standalone binary", async ({ home }) => {
      await mkdir(join(home.aireg, "bin"), { recursive: true, mode: 0o700 });
      await writeFile(join(home.aireg, "bin", "aireg"), "#!/bin/sh\n");
      const spec = serviceSpec({
        platform: "darwin",
        entry: join(home.aireg, "cli", "1.2.3", "aireg"),
        uid: 501,
        accountHome: home.dir,
      });
      expect(spec.daemon).toEqual([join(home.aireg, "bin", "aireg"), "--internal-daemon"]);
      expect(spec.starter).toEqual([join(home.aireg, "bin", "aireg"), "daemon", "start"]);
      expect(spec).toMatchObject({
        suffix: "",
        env: { PATH: "/opt/tools/bin:/usr/bin:/bin" },
        home: home.dir,
        configHome: join(home.dir, ".config"),
      });
    });

    test("runs a script entry under the node that runs this CLI", () => {
      const spec = serviceSpec({
        platform: "linux",
        entry: "/opt/registry/bin/registry.mjs",
        execPath: "/usr/bin/node",
      });
      expect(spec.daemon).toEqual([
        "/usr/bin/node",
        "--disable-warning=ExperimentalWarning",
        "/opt/registry/bin/registry.mjs",
        "--internal-daemon",
      ]);
    });

    test("names node by the PATH link that survives an upgrade, not its versioned target", async ({
      home,
    }) => {
      const versioned = join(home.dir, "versions", "node", "25.9.0", "bin");
      await mkdir(versioned, { recursive: true });
      await writeFile(join(versioned, "node"), "");
      await mkdir(join(home.dir, "bin"));
      await symlink(join(versioned, "node"), join(home.dir, "bin", "node"));
      vi.stubEnv("PATH", `/nowhere:${join(home.dir, "bin")}`);
      const spec = serviceSpec({
        platform: "darwin",
        entry: "/lib/registry.mjs",
        execPath: join(versioned, "node"),
      });
      expect(spec.daemon[0]).toBe(join(home.dir, "bin", "node"));
    });

    test("carries an overridden home into the service and names it apart", ({ home }) => {
      const other = join(home.dir, "other");
      vi.stubEnv("AIREG_HOME", other);
      const spec = serviceSpec({
        platform: "linux",
        entry: "/bin/registry",
        accountHome: home.dir,
      });
      expect(spec.suffix).toMatch(/^[0-9a-f]{16}$/);
      expect(spec.env.AIREG_HOME).toContain("other");
    });

    test("keeps the plain name when the account's own aireg home is a symlink", async ({
      home,
    }) => {
      const elsewhere = join(home.dir, "dotfiles-aireg");
      await mkdir(elsewhere);
      await symlink(elsewhere, home.aireg);
      const spec = serviceSpec({
        platform: "darwin",
        entry: "/bin/registry",
        accountHome: home.dir,
      });
      expect(spec.suffix).toBe("");
    });

    test("names a second HOME apart from the account's own, and carries its home", ({ home }) => {
      const spec = serviceSpec({
        platform: "darwin",
        entry: "/bin/registry",
        accountHome: "/Users/real",
      });
      expect(spec.suffix).toMatch(/^[0-9a-f]{16}$/);
      expect(spec.env.AIREG_HOME).toBe(home.aireg);
    });
  });

  test("hands a running daemon over, then does nothing the second time", async ({ home }) => {
    const fake = fakeExec({ "systemctl --user is-enabled aireg-daemon.service": { code: 1 } });
    const stop = vi.fn(async () => {});
    const options = {
      platform: "linux" as const,
      entry: "/bin/registry",
      exec: fake.exec,
      accountHome: home.dir,
    };

    const first = await enableAutostart(stop, options);
    expect(first).toMatchObject({
      changed: true,
      state: { mechanism: "systemd", registered: true },
    });
    expect(stop).toHaveBeenCalledTimes(1);

    fake.answer("systemctl --user is-enabled aireg-daemon.service", { code: 0 });
    const second = await enableAutostart(stop, options);
    expect(second?.changed).toBe(false);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test("rewrites a definition left by another install", async ({ home }) => {
    const fake = fakeExec();
    const stop = vi.fn(async () => {});
    await enableAutostart(stop, {
      platform: "linux",
      entry: "/old/registry",
      exec: fake.exec,
      accountHome: home.dir,
    });
    const moved = await enableAutostart(stop, {
      platform: "linux",
      entry: "/new/registry",
      exec: fake.exec,
      accountHome: home.dir,
    });
    expect(moved?.changed).toBe(true);
    expect(
      (
        await autostartState({
          platform: "linux",
          entry: "/new/registry",
          exec: fake.exec,
          accountHome: home.dir,
        })
      )?.current,
    ).toBe(true);
  });

  test("disables idempotently", async ({ home }) => {
    const fake = fakeExec();
    const options = {
      platform: "linux" as const,
      entry: "/bin/registry",
      exec: fake.exec,
      accountHome: home.dir,
    };
    await enableAutostart(async () => {}, options);
    expect((await disableAutostart(options))?.changed).toBe(true);
    fake.answer("systemctl --user is-enabled aireg-daemon.service", { code: 1 });
    expect((await disableAutostart(options))?.changed).toBe(false);
  });

  test("knows no mechanism on other platforms", async () => {
    expect(await autostartState({ platform: "freebsd", entry: "/bin/registry" })).toBeUndefined();
    expect(await startManaged({ platform: "freebsd", entry: "/bin/registry" })).toBe(false);
  });
});
