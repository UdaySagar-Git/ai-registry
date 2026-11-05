import type { SourceFlags } from "#engine/address/probe.ts";
import type { CommonOptions } from "#engine/options.ts";

export interface Flags extends SourceFlags {
  as?: string;
  name?: string;
  description?: string;
  namespace?: string[];
  base?: string;
}

/** What every action reads: its one argument, and the options of the whole command line. */
export interface Options {
  argument: string | undefined;
  flags: Flags;
  common: CommonOptions;
}
