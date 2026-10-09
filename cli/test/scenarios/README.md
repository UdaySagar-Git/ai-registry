# Scenarios

A scenario is a Markdown file read top to bottom: a CLI session with the output it expects.

- Front matter builds the world: `registries: { kit: [kit/lint@1.0.0, agent kit/triage@1.0.0] }`
  writes a file spec registry at `[ROOT]/kit`; `dirs: [.claude]` and
  `files: { path: text }` create folders and files.
- A ```console block holds `$ aireg ...` lines, each followed by the output it
  expects: stdout, indented when it is JSON, then stderr. `? <code>` on the next
  line expects a non-zero exit.
  `[..]` matches the rest of a line up to what follows it, a `...` line any lines.
- A ```file <path> block asserts a file's content with the same wildcards, and
  `!file <path>` asserts nothing is there.

Paths resolve against the project unless they start with `[ROOT]`, `[HOME]` or
`[PROJECT]`, which output is redacted to as well. `UPDATE_SCENARIOS=1` rewrites
whatever no longer matches with what the CLI printed.
