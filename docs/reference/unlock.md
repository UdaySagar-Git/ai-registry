# aireg unlock

Show or clear a stuck write lock.

## Synopsis

```text
aireg unlock [-g]
aireg unlock [-g] <id>
```

## Description

Only one aireg process at a time can write to a project, or to your user scope. A command that installs, publishes or syncs takes a write lock first, and a second command waits for it. The process holding the lock renews it every 15 seconds. A lock that isn't renewed for 30 seconds is stuck, and the next command takes it over by itself. A process still running on the same machine keeps its lock, even when it is paused and cannot renew it.

`aireg unlock` shows which process is writing to the current project, or with `-g` to your user scope: its process id, the machine it runs on and how long it has held the lock.

To clear a lock by hand, give its id. Do this only when you know the process holding it has stopped. A process whose lock was cleared or taken over stops with an error before its next write, so the change it was making is lost and you run that command again.

A command waiting on a lock says so on stderr and names the process it waits for. A command you interrupt releases its lock before it exits.

## Options

`unlock` takes `-g`, to act on your user scope. See [Command options](options.md#command-options).

## JSON output

```json
{"ok": true, "data": {"scope": "project", "held": true, "holder": {"id": "...", "pid": 14300, "host": "laptop", "acquiredAtMs": 1760000000000}}}
```

After clearing a lock, `data` holds the `scope` and the `broken` lock.

## Exit status

- `0`: nothing holds the lock, the process holding it was shown, or the lock was cleared.
- `2`: the id doesn't match the lock, or no lock is held, or `unlock` was run outside a project without `-g`.

## Examples

See what is writing to this project:

```bash
aireg unlock
```

Clear a stuck lock on your user scope:

```bash
aireg unlock -g 5b1c9f0e-8a77-4c55-9b1e-2f0a6d3c7e41
```

## See also

[`aireg logs`](logs.md), [CLI reference](index.md)
