import { parse } from "yaml";

// yaml warns through process.emitWarning with an excerpt of the source, escapes and all.
const QUIET = { logLevel: "error" } as const;

/** A document a registry or a project wrote: errors still throw, warnings stay off the terminal. */
export function parseYaml(text: string): unknown {
  return parse(text, QUIET);
}
