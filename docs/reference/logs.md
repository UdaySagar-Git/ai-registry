# aireg logs

Read aireg's diagnostic logs.

## Synopsis

```text
aireg logs [-f] [-n <count>] [--since <time>] [--until <time>] [--level <level>] [--grep <text>]
           [--daemon] [--cli] [--stderr] [--previous]
```

## Description

`aireg logs` prints the newest entries from aireg's logs, oldest first, merged from every log it reads.

aireg keeps three logs in `~/.aireg/logs/`:

| Log | Option | Written |
|---|---|---|
| `daemon.log` | `--daemon` | Whenever the daemon runs. |
| `aireg.log` | `--cli` | Only when a command runs with `--log-level`, or with `AIREG_LOG_LEVEL` set. |
| `daemon-stderr.log` | `--stderr` | The daemon's own error output. |

Without one of these options, `logs` reads `daemon.log` and `aireg.log`. Those two are rotated at 5 MiB, and aireg keeps four older copies. When the daemon starts and `daemon-stderr.log` is past 5 MiB, the daemon copies it to `daemon-stderr.log.1` and empties it, whether a command or [autostart](daemon.md#aireg-daemon-autostart) started it.

## Options

| Option | Description |
|---|---|
| `-f`, `--follow` | Keep printing new entries as they are written, until you stop it. |
| `-n`, `--tail <count>` | How many of the newest entries to print. Defaults to 50; `0` prints none, so `-f -n 0` shows only new entries. |
| `--since <time>` | Only entries at or after this time: a duration back from now, such as `15m`, `2h` or `1d`, or a date. |
| `--until <time>` | Only entries at or before this time, in the same forms. |
| `--level <level>` | Only entries at this level or above: `trace`, `debug`, `info`, `warn`, `error` or `fatal`. |
| `--grep <text>` | Only entries that contain this text. |
| `--daemon`, `--cli`, `--stderr` | Read only these logs. |
| `--previous` | Read the last rotated copy of each log instead. |

## JSON output

With `--json`, the entries print as one document, oldest first, each with the `log` it came from:

```json
{"ok": true, "data": {"entries": [{"log": "daemon", "entry": {}}]}}
```

With `--follow --json`, each entry prints as its own line as it arrives, as `{"ok": true, "data": {"log": "daemon", "entry": {}}}`.

## Exit status

- `0`: printed, or there was nothing to print.
- `2`: a value for `--tail`, `--level`, `--since` or `--until` isn't valid, or an argument was given.

## Examples

See why a background sync failed:

```bash
aireg logs --daemon --level warn
```

Record a command's diagnostics, then read them:

```bash
aireg --log-level debug install
aireg logs --cli --since 5m
```

## See also

[`aireg daemon`](daemon.md), [`aireg doctor`](doctor.md), [CLI reference](index.md)
