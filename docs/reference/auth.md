# aireg auth

Sign in to your registries, and manage the accounts aireg uses.

## Synopsis

```text
aireg auth login <registry> [--address <address>] [--adapter <id>] [--token-stdin]
aireg auth list
aireg auth logout <registry>
aireg auth remove <registry>
```

`aireg auth` on its own runs `aireg auth list`.

## Description

Some registries need you to sign in before aireg can read from them or publish to them. aireg keeps one account per registry on this machine, saved in `~/.aireg/config.yml`. Its token is kept in `~/.aireg/credentials.json`, which only you can read, with the address it was issued for. aireg sends it to that scheme, host and port and nowhere else, so a project you clone cannot point your sign-in at another host; a command that would do so stops and says why. A job that runs as an account keeps working for as long as the account is signed in.

A git registry needs no sign-in from aireg: aireg reads it with your own git configuration. Sign in with git instead, for example with `gh auth login` or a git credential helper.

In CI, set `AIREG_TOKEN_<NAME>` instead of signing in. aireg uses it for that command, never writes it to disk, and prefers it to a stored sign-in. While it is set, `aireg auth login` for that registry stores nothing and exits with `1`, since commands would go on using the variable; unset it to store a sign-in. It is sent only to the registry of that name the current scope declares: the project's manifest in a project, otherwise your user scope. Background jobs never see it: the daemon does not inherit it from the command that started it. See [Environment and files](environment.md).

## aireg auth login

Signs in to a registry and saves the account. The registry is found where [`aireg add`](add.md) finds it: the current project first, then your user scope. One declared only by the project is declared in your user scope too, since an account is yours, so aireg shows its address and asks first; without a terminal to ask on, pass `--yes`, or name the address with `--address`.

aireg names the address it signed in to and, when the registry says, who the sign-in belongs to: `Signed in to acme at https://registry.acme.example/team as jane@acme.example.`

A token never comes from an argument, since arguments show in `ps` and in your shell history. Pipe it in with `--token-stdin`, which refuses to read a terminal, where the token would echo.

Without a token, a registry whose adapter has a sign-in page opens it in your browser. aireg prints the link too, in case the browser doesn't open, and waits up to five minutes for you to sign in there. The page sends aireg a one-time code on this machine, at `http://127.0.0.1` on a free port, and aireg saves the sign-in it gets for it. A sign-in that expires is renewed without asking you again. aireg never opens the browser in CI; use `--token-stdin` or `AIREG_TOKEN_<NAME>` there. Without a sign-in page, the registry's adapter runs its own sign-in, if it has one.

| Option | Description |
|---|---|
| `--address <address>` | The address to sign in to, for a registry that isn't declared. |
| `--adapter <id>` | The adapter that reads the registry, when aireg can't tell from the address. |
| `--token-stdin` | Read the registry's token from standard input. |

## aireg auth list

Lists the accounts on this machine, with each one's registry, whether it is signed in, the namespace it publishes into when it has one, and its id. A job keeps an account for each registry it syncs, so a folder or git registry is listed too, as `no sign-in`. `ls` is the same command.

## aireg auth logout

Signs out of a registry and keeps the account, so the jobs that run as it keep their reference. Sign in again with `aireg auth login`.

## aireg auth remove

Deletes an account. `rm` is the same command. An account that a job runs as is refused; remove those jobs first with [`aireg job remove`](job.md#aireg-job-remove), or sign out instead.

## JSON output

`list`:

```json
{"ok": true, "data": {"accounts": [{"id": "acc_1", "registry": "acme", "defaultNamespace": "engineering", "signedIn": true, "needsSignIn": true}]}}
```

`needsSignIn` is `false` for a registry aireg doesn't sign in to, such as a folder or a git registry. `login` returns the `account`, and the `identity` the registry reports for the sign-in when it reports one: a `name`, and the `account` it acts within where the registry has one. `logout` and `remove` return its `accountId`.

## Exit status

- `0`: signed in, signed out, listed or removed.
- `1`: no account has that name, a job runs as the account being removed, the registry can't be reached, or `AIREG_TOKEN_<NAME>` is already set for that registry.
- `2`: no registry was named, the registry needs no sign-in, the project and your user scope declare the name at different addresses, only the project declares it and there is no terminal to confirm (pass `--yes` or `--address`), or `--token-stdin` read a terminal or got no token.
- `4`: the registry refused the token, or the browser sign-in was declined, refused or not finished in time.

## Examples

Sign in to the `acme` registry in your browser:

```bash
aireg auth login acme
```

Sign in to the `acme` registry with a token from a file:

```bash
aireg auth login acme --token-stdin < ~/acme-token
```

See which registries you are signed in to:

```bash
aireg auth list
```

## See also

[`aireg registry`](registry.md), [`aireg job`](job.md), [Environment and files](environment.md), [CLI reference](index.md)
