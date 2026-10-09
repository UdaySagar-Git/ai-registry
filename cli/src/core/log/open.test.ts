import { readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { expect } from "vitest";
import { test } from "#test/kit/fixtures.ts";
import { openDaemonLog } from "./open.ts";
import { DAEMON_STDERR_FILE, logPath } from "./sink.ts";

test("trims the daemon's stderr capture past 5 MiB when the daemon starts", async ({ home }) => {
  const path = logPath(home.aireg, DAEMON_STDERR_FILE);
  await mkdir(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.alloc(5 * 1024 * 1024 + 1, "x"));
  openDaemonLog("test").close();
  expect(statSync(`${path}.1`).size).toBe(5 * 1024 * 1024 + 1);
  expect(readFileSync(path, "utf8")).toBe("");
});
