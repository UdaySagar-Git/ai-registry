import { compareVersion, parseVersion } from "#adapter/semver.ts";
import { NAME } from "#core/product.ts";

// Replaced at build time; source execution uses a development version.
declare const __VERSION__: string;
declare const __COMMIT__: string;

/** A run from source; dev-ring builds are `X.Y.Z-dev.N` and update like any release. */
const SOURCE_VERSION = "0.0.0-dev";

export const VERSION = typeof __VERSION__ === "string" ? __VERSION__ : SOURCE_VERSION;

/** The commit a release build was made from; empty when run from source. */
const COMMIT = typeof __COMMIT__ === "string" ? __COMMIT__ : "";

export function isSourceVersion(version: string): boolean {
  return version === SOURCE_VERSION;
}

/** What `--version --json` reports. */
export function versionInfo(): { version: string; commit?: string } {
  return COMMIT === "" ? { version: VERSION } : { version: VERSION, commit: COMMIT };
}

/** The oldest Node.js aireg runs on, matching `engines` in package.json. */
export const MIN_NODE = "22.20.0";

export function nodeTooOld(node = process.versions.node): string | undefined {
  const current = parseVersion(node);
  const min = parseVersion(MIN_NODE);
  if (current === undefined || min === undefined) return undefined;
  if (compareVersion(current, min) >= 0) return undefined;
  return `${NAME} requires Node.js ${MIN_NODE} or later; this is ${node}.`;
}
