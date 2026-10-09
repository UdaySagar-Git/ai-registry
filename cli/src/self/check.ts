import { readFile } from "node:fs/promises";
import { gte } from "#adapter/semver.ts";
import { updateAdapters } from "#core/adapter/installed/update.ts";
import { isCI, isSet } from "#core/env.ts";
import { writeAtomic } from "#core/fs/atomic.ts";
import type { Printer } from "#core/output.ts";
import { spawnDetached } from "#core/process.ts";
import { launchArgv, runningEntry } from "#core/release/launch.ts";
import { updateCheckPath, versionBin } from "#core/release/layout.ts";
import { releaseStamp } from "#core/release/stamp.ts";
import { ensureHome } from "#core/store/paths.ts";
import { VERSION } from "#core/version.ts";
import { versionOnDisk } from "./install.ts";
import { installRelease, isInstalledCli, probeRelease, type RecycleDaemon } from "./minimum.ts";
import { describeSize, downloadSize, type ResolvedRelease } from "./source.ts";

/** Matches the daemon's check, so a machine with no daemon keeps the same pace. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000;
/** Nobody waits on the background check, so it can give a slow link longer. */
const REFRESH_TIMEOUT_MS = 30_000;
const ADAPTER_TIMEOUT_MS = 10_000;

export const UPDATE_CHECK_FLAG = "--internal-update-check";

export interface UpdateCache {
  /** When the channel was last asked, answered or not, so a dead origin costs one try per interval. */
  checkedAt: number;
  latest?: string | undefined;
  /** The signed artifact size, so the hint can say what the update costs. */
  sizeBytes?: number | undefined;
  minimumVersion?: string | undefined;
}

/** A time in the future is stale, so a clock moved backwards cannot pin the cache. */
function isFresh(at: number | undefined, now = Date.now()): boolean {
  return at !== undefined && now - at >= 0 && now - at < CHECK_INTERVAL_MS;
}

export function cacheFrom(release: ResolvedRelease, now = Date.now()): UpdateCache {
  return {
    checkedAt: now,
    latest: release.version,
    sizeBytes: downloadSize(release),
    minimumVersion: release.minimumVersion,
  };
}

export function skipUpdateCheck(env: NodeJS.ProcessEnv, json: boolean, tty: boolean): boolean {
  if (json || !tty) return true;
  if (isCI(env) || isSet("DISABLE_UPDATE_CHECK", env)) return true;
  return false;
}

export async function readUpdateCache(
  env: NodeJS.ProcessEnv = process.env,
): Promise<UpdateCache | undefined> {
  try {
    const raw = JSON.parse(await readFile(updateCheckPath(env), "utf8")) as unknown;
    if (typeof raw !== "object" || raw === null) return undefined;
    const doc = raw as Record<string, unknown>;
    if (typeof doc.checkedAt !== "number") return undefined;
    return {
      checkedAt: doc.checkedAt,
      latest: typeof doc.latest === "string" ? doc.latest : undefined,
      sizeBytes: typeof doc.sizeBytes === "number" ? doc.sizeBytes : undefined,
      minimumVersion: typeof doc.minimumVersion === "string" ? doc.minimumVersion : undefined,
    };
  } catch {
    return undefined;
  }
}

export async function writeUpdateCache(
  cache: UpdateCache,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  ensureHome(env);
  await writeAtomic(updateCheckPath(env), `${JSON.stringify(cache)}\n`);
}

/** The claim is written first, so the commands after it start none. */
export async function scheduleUpdateCheck(
  env: NodeJS.ProcessEnv = process.env,
  entry = runningEntry(),
  $spawn: typeof spawnDetached = spawnDetached,
): Promise<void> {
  if (isCI(env) || isSet("DISABLE_UPDATE_CHECK", env)) return;
  if (entry === undefined || releaseStamp(env) === undefined) return;
  const cached = await readUpdateCache(env);
  if (isFresh(cached?.checkedAt)) return;
  await writeUpdateCache({ ...cached, checkedAt: Date.now() }, env);
  const launch = launchArgv(entry, [UPDATE_CHECK_FLAG]);
  $spawn(launch.command, launch.args, { env }).on("error", () => {});
}

/** The detached child's work; a version already on disk is a rollback to respect. */
export async function refreshUpdates(
  recycle: RecycleDaemon,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const release = await probeRelease(env, fetch, REFRESH_TIMEOUT_MS);
  const entry = runningEntry();
  if (release === undefined || entry === undefined || !isInstalledCli(entry, env)) return;
  let updated = false;
  if (!gte(VERSION, release.version) && !(await versionOnDisk(release.version, env))) {
    await installRelease(release, env);
    updated = true;
  }
  const adapters = await updateAdapters(env, { signal: AbortSignal.timeout(ADAPTER_TIMEOUT_MS) });
  if (updated) await recycle(versionBin(release.version, env), release.version);
  else if (adapters.length > 0) await recycle(entry, VERSION);
}

/** After a successful command: what the last check heard, without asking again. */
export async function hintUpdate(
  printer: Printer,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (skipUpdateCheck(env, printer.format === "json", process.stderr.isTTY === true)) return;
  const cached = await readUpdateCache(env);
  const latest = cached?.latest;
  if (latest === undefined || gte(VERSION, latest)) return;
  // On disk already: the background check installed it, or the user rolled back from it.
  if (isInstalledCli(runningEntry(), env) && (await versionOnDisk(latest, env))) return;
  printer.hint(
    `aireg ${latest} is available (you have ${VERSION}). Run \`aireg self update\` to install it${describeSize(cached?.sizeBytes)}.`,
  );
}
