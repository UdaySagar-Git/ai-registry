import type { CommandContext } from "#cli/commands/command.ts";
import { type OutputFormat, Printer } from "#core/term/printer.ts";
import type { CommonOptions } from "#engine/options.ts";

export interface CommandContextOptions {
  cwd?: string;
  format?: OutputFormat;
  /** Collects what the command prints; read it with `printed.join("")`. */
  printed?: string[];
  /** Collects what the command writes to standard error, dropped when absent. */
  errors?: string[];
}

/** A context as `main.ts` gives a built-in command, with no host to connect accounts or runs. */
export function commandContext(
  argv: string[],
  options: CommandContextOptions = {},
): CommandContext {
  const printed = options.printed ?? [];
  const errors = options.errors ?? [];
  return {
    argv,
    cwd: options.cwd ?? process.cwd(),
    printer: new Printer({
      format: options.format ?? "json",
      color: "never",
      out: { write: (chunk: string) => printed.push(chunk) > 0, isTTY: false },
      err: { write: (chunk: string) => errors.push(chunk) > 0, isTTY: false },
    }),
    host: {
      version: "test",
      connectAccount: async () => {
        throw new Error("no host");
      },
      openRunStore: async () => {
        throw new Error("no host");
      },
    },
  };
}

/** The options every command shares, as parsed from a command line with no flags. */
export function commonOptions(overrides: Partial<CommonOptions> = {}): CommonOptions {
  return {
    scope: undefined,
    targets: undefined,
    select: undefined,
    yes: false,
    all: false,
    dryRun: false,
    frozen: false,
    force: false,
    copy: false,
    ...overrides,
  };
}
