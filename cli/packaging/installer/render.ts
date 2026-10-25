import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { formatVersion, parseVersion } from "#adapter/semver.ts";
import { envName } from "#core/env.ts";
import { hasOnly, isRecord } from "#core/fields.ts";
import { isSha256Hex } from "#core/fs/hash.ts";
import { HOME_DIR, NAME } from "#core/product.ts";
import type { ReleasePlatform } from "#core/release/urls.ts";
import { TARGETS } from "#packaging/targets.ts";
import { artifactBaseUrl, artifactsUrl, installerOrigin } from "./origin.ts";

const SH_TEMPLATE = new URL("install.sh.tmpl", import.meta.url);
const POWERSHELL_TEMPLATE = new URL("install.ps1.tmpl", import.meta.url);
/** The sha256 of each installer every earlier release published, from its SHA256SUMS. */
const EARLIER_INSTALLERS = new URL("installers.json", import.meta.url);
const INSTALLER_FILES = ["install.sh", "install.ps1"] as const;

const PLACEHOLDER = /\{\{([A-Za-z0-9_]+)\}\}/g;

export interface InstallerConfig {
  readonly version: string;
  /** The https release origin, such as https://aireg.sh. */
  readonly origin: string;
  /** Directory holding the compiled `aireg-<os>-<arch>[.exe]` assets. */
  readonly binaryDir: string;
  /** Per earlier version, its installers' sha256 by filename; defaults to installers.json. */
  readonly earlier?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

const DIGEST_KEY = {
  "darwin-amd64": "DarwinAMD64",
  "darwin-arm64": "DarwinARM64",
  "linux-amd64": "LinuxAMD64",
  "linux-arm64": "LinuxARM64",
  "windows-amd64": "WindowsAMD64",
  "windows-arm64": "WindowsARM64",
} as const satisfies Record<ReleasePlatform, string>;

/**
 * Fails on a name with no value *or* a value with no name. The second half
 * catches a renamed placeholder, which ships a script that can never match.
 */
export function renderTemplate(source: string, values: Readonly<Record<string, string>>): string {
  const unused = new Set(Object.keys(values));
  const rendered = source.replace(PLACEHOLDER, (_match: string, key: string): string => {
    const value = values[key];
    if (value === undefined) throw new Error(`installer template has no value for {{${key}}}`);
    unused.delete(key);
    return value;
  });
  if (unused.size > 0) {
    throw new Error(`installer template never used ${[...unused].sort().join(", ")}`);
  }
  return rendered;
}

function digestOf(path: string): string {
  const stats = statSync(path);
  if (!stats.isFile() || stats.size === 0) throw new Error(`${path} is not a built binary`);
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * `[version, sha256]` for each earlier release that published `file`. Both are written
 * into the script, so only an exact version and a hex digest pass.
 */
function earlierInstallers(earlier: unknown, file: string): [string, string][] {
  if (!isRecord(earlier)) throw new Error("installers.json must map versions to digests");
  return Object.entries(earlier).flatMap(([version, files]): [string, string][] => {
    const parsed = parseVersion(version);
    if (parsed === undefined || formatVersion(parsed) !== version)
      throw new Error(`installers.json: ${version} is not an exact version`);
    if (!hasOnly(files, INSTALLER_FILES))
      throw new Error(`installers.json: ${version} names a file that is not an installer`);
    const digest = files[file];
    if (digest === undefined) return [];
    if (typeof digest !== "string" || !isSha256Hex(digest))
      throw new Error(`installers.json: ${version} ${file} is not a sha256`);
    return [[version, digest]];
  });
}

function pinnedInstallers(config: InstallerConfig, windows: boolean): string {
  const earlier = config.earlier ?? JSON.parse(readFileSync(EARLIER_INSTALLERS, "utf8"));
  return earlierInstallers(earlier, windows ? "install.ps1" : "install.sh")
    .map(([version, digest]) =>
      windows ? `    '${version}' = '${digest}'` : `    ${version}) pinned=${digest} ;;`,
    )
    .join("\n");
}

/** The values both installers share, and the digests of the platforms `windows` selects. */
function installerValues(config: InstallerConfig, windows: boolean): Record<string, string> {
  const origin = installerOrigin(config.origin);
  const artifactBase = artifactBaseUrl(config.origin, config.version);
  const artifacts = artifactsUrl(config.origin);
  if (origin === undefined || artifactBase === undefined || artifacts === undefined) {
    throw new Error("installer needs an https origin with a plain path and an exact version");
  }
  const values: Record<string, string> = {
    Version: config.version,
    Origin: origin,
    ArtifactBase: artifactBase,
    Artifacts: artifacts,
    VersionEnv: envName("VERSION"),
    Name: NAME,
    HomeDir: HOME_DIR,
    HomeEnv: envName("HOME"),
    Installers: pinnedInstallers(config, windows),
  };
  for (const target of TARGETS) {
    if ((target.os === "windows") !== windows) continue;
    values[DIGEST_KEY[target.platform]] = digestOf(join(config.binaryDir, target.filename));
  }
  return values;
}

/** `install.sh`, for macOS and Linux. */
export function renderInstaller(config: InstallerConfig): string {
  return renderTemplate(readFileSync(SH_TEMPLATE, "utf8"), installerValues(config, false));
}

/** `install.ps1`, for Windows. */
export function renderWindowsInstaller(config: InstallerConfig): string {
  return renderTemplate(readFileSync(POWERSHELL_TEMPLATE, "utf8"), installerValues(config, true));
}
