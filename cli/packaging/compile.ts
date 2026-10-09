import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { formatVersion, parseVersion } from "#adapter/semver.ts";
import { defines } from "./defines.ts";
import { BUN_VERSION, type Target } from "./targets.ts";

/** Bundled by Bun, not by tsup: the compiled binary has no `dist/` to load. */
const ENTRY = join("src", "main.ts");

export interface CompileOptions {
  readonly target: Target;
  readonly version: string;
  /** Release origin, stamped in. Empty builds a binary that does not update itself. */
  readonly origin: string;
  /** Encoded trusted Ed25519 keyring, stamped in. Empty fails signing closed. */
  readonly keyring: string;
  /** The source commit, reported by `--version --json`. */
  readonly commit?: string;
  readonly outFile: string;
}

/**
 * The `bun build` argv for one target. `--bytecode` and `--minify` are absent
 * on purpose; compile.test.ts asserts that and says why.
 */
export function compileArgs(options: CompileOptions): string[] {
  const version = parseVersion(options.version);
  if (version === undefined || formatVersion(version) !== options.version) {
    throw new Error(`compile version must be exact SemVer (got ${options.version})`);
  }
  return [
    "build",
    "--compile",
    `--target=${options.target.bunTarget}`,
    // Bun otherwise reads .env and bunfig.toml from whatever folder aireg runs in.
    "--no-compile-autoload-dotenv",
    "--no-compile-autoload-bunfig",
    // Build inputs, never configuration: a redirectable origin makes the signature check decorative.
    ...Object.entries(
      defines({
        version: options.version,
        origin: options.origin,
        keyring: options.keyring,
        commit: options.commit ?? "",
      }),
    ).flatMap(([name, value]) => ["--define", `${name}=${value}`]),
    `--outfile=${options.outFile}`,
    ENTRY,
  ];
}

function bunVersion(bun = "bun"): string {
  return execFileSync(bun, ["--version"], { encoding: "utf8" }).trim();
}

export function compile(options: CompileOptions, cwd: string, bun = "bun"): string {
  const found = bunVersion(bun);
  if (found !== BUN_VERSION) {
    throw new Error(`release builds pin Bun ${BUN_VERSION}; this is ${found}`);
  }
  mkdirSync(dirname(options.outFile), { recursive: true });
  execFileSync(bun, compileArgs(options), { cwd, stdio: "inherit" });
  return options.outFile;
}
