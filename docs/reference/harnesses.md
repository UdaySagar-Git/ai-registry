# aireg harnesses

List the harnesses aireg can install into, and which this machine has.

## Synopsis

```text
aireg harnesses
```

## Description

`aireg harnesses` lists every harness name [`--for`](options.md#harnesses) accepts, and whether aireg found that coding agent on this machine. It finds one by its environment variables, its program on your `PATH`, or its folder in the project or your home folder.

The shared `.agents` folder is read by several coding agents, so it is never detected; it is listed last, as `always used`.

`harnesses` doesn't need a project.

## Options

`harnesses` has no options of its own.

## JSON output

```json
{"ok": true, "data": {"harnesses": [{"name": "claude", "displayName": "Claude Code", "shared": false, "detected": true, "by": "binary"}]}}
```

The harnesses are in the order the text lists them. `shared` is true for the shared `.agents` folder, which is always used and never detected. `by` is `env`, `binary`, `project` or `user`, and is left out when the harness wasn't found.

## Exit status

- `0`: listed.
- `2`: an argument was given.

## Examples

See which coding agents this machine has:

```bash
aireg harnesses
```

```text
  harness  status       where
  claude   found        on your PATH
  codex    not found
  cursor   not found
  agents   always used  the shared .agents folder

Found 1 of 3 supported harnesses on this machine.
```

## See also

[Harnesses](options.md#harnesses), [`aireg doctor`](doctor.md), [CLI reference](index.md)
