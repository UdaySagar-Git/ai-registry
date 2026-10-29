# MCP servers

!!! note "Draft design"
    This page describes a planned `mcp_server` kind. None of it is implemented behavior yet: aireg does not install MCP servers today. It records what the kind will do, why, and what it deliberately leaves out, so the work that follows can be reviewed against it.

## The problem

A coding agent reaches tools through MCP servers that it starts from its own configuration. Every agent keeps that configuration in a different file, in a different shape, with a different way of referring to a secret. Teams copy server definitions between those files by hand, and each copy drifts: a version changes in one, a token is pasted into another, a server nobody uses stays in a third.

Three properties make this worse than copying skills:

- **A server is a command every agent will run.** An MCP server definition is a program and its arguments. The September 2025 `postmark-mcp` incident showed what that means: fifteen clean releases of an npm package were followed by version 1.0.16, which added one line that blind-copied every email the server sent to its author. Any definition that ran `npx postmark-mcp` without a version picked it up.
- **Definitions carry credentials.** A server's environment variables and headers often hold API tokens, and the obvious way to share a definition is to share the token with it.
- **Agents treat a project's servers differently from a user's.** Some ask before they start a project's servers, some start them silently, and some start no project server until the folder is trusted.

The `mcp_server` kind gives a server definition the same treatment a skill gets: one published, immutable, verified version, installed into each agent's own configuration from a registry.

## How other tools handle it

| Tool | Format it reads | Secrets | Pinning | Ownership and drift |
|---|---|---|---|---|
| Official MCP Registry | `server.json` | `isSecret` on each input; values never stored | rejects version ranges; `fileSha256` for MCPB | not a client |
| Microsoft APM | `server.json` from the MCP Registry | writes references, never resolved values; a missing required value declines that target | the package version | updates an entry only while it matches its recorded baseline |
| skillshare | its own YAML | `fromEnv` references; a target that cannot express a setting blocks the preview | warns on an unpinned `npx` | per-target manifest |
| rulesync | its own format with `${VAR}` | translated per tool | none | regenerates the files it owns |
| Codex | its own TOML | `env_vars`, `bearer_token_env_var`, `env_http_headers` | none | its own file |

Two of these choices carry over directly: APM's use of the official `server.json`, and its rule that an entry is updated only while it still matches what was last written. skillshare's rule that a target which cannot express a setting is refused, rather than given a weaker copy, carries over too.

## Decisions

### The native file is the official `server.json`

A version's native file is the MCP Registry's `server.json`, byte for byte, validated against the dated schema it names (`https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json` is the current one). The file spec's envelope rule already requires wrapping a kind's existing format rather than rewriting it.

The format does most of what this kind needs. It describes each way to run the server as a package (`npm`, `pypi`, `oci`, `nuget`, `mcpb`, `cargo`) or a remote (`streamable-http`, `sse`). It rejects version ranges: "Must be a specific version. Version ranges are rejected." It marks each environment variable, header and argument `isSecret` and `isRequired`, and requires a SHA-256 for MCPB packages. Every server already published to the MCP Registry is a valid native file.

Rejected: a format of aireg's own, as rulesync has. It would need a converter for every server already described in `server.json`, and it would drift from the format the MCP project maintains.

### The envelope

```json
{
  "kind": "mcp_server",
  "metadata": { "namespace": "engineering", "name": "issue-tracker", "version": "1.4.2" },
  "files": [{ "path": "server.json", "media_type": "application/json" }],
  "spec": {
    "name": "issue-tracker",
    "description": "Reads and comments on issues in the team's tracker.",
    "server": { "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json", "name": "io.github.example/issue-tracker", "version": "1.4.2", "…": "…" }
  }
}
```

`spec.server` is the `server.json` object unchanged. `spec.name` is the registry slug, because a `server.json` name such as `io.github.example/issue-tracker` contains a `/` and a `.` that the file spec's name grammar does not allow. `spec.description` copies the server's description for search. This follows the precedent of the `agent` kind, which wraps an A2A card the same way. `spec.server.version` SHOULD equal `metadata.version`, so a reader never has to explain two versions of one artifact.

### The name an agent sees

An agent knows a server by the key it has in the agent's configuration, and that key becomes part of every tool name: Claude Code calls a tool `mcp__<server>__<tool>`, OpenCode `<server>_<tool>`. The install name is the artifact's name, which already matches `^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$`. This kind narrows it to `^[a-z][a-z0-9-]{0,47}$`, which every target accepts as a key unchanged. A target that reserves a name refuses to install a server under it.

### Launch resolution and pinning

aireg turns each package into an exact launch, and refuses one it cannot pin:

| `registryType` | Launch | Pinned by |
|---|---|---|
| `npm` | `npx -y <identifier>@<version>` | `version`, required |
| `pypi` | `uvx <identifier>==<version>` | `version`, required |
| `nuget` | `dnx <identifier>@<version>` | `version`, required |
| `oci` | `docker run -i --rm <image>` | an image reference with a digest is preferred; a tag is accepted and recorded |
| `mcpb` | the bundle at `identifier` | `fileSha256`, verified before the bundle is used |
| `cargo` | none | refused: Cargo has no one-shot runner, so the server must be installed outside aireg first |
| a remote | the URL | the URL itself |

`runtimeArguments` go before the package and `packageArguments` after it, as the MCP Registry describes. The lockfile records, for each target, the launch it wrote and the names of the inputs it referenced, never their values. A server version that names no exact version for a package is refused for that package. A server with several ways to run is installed with the first that every selected target can express: a remote with no secret inputs, then packages in the order above.

### Secrets are references

No secret value is stored in the registry, in the lockfile, or in any file aireg writes. Each input `server.json` marks `isSecret` becomes a reference to an environment variable of the same name, written in the target's own syntax. A target that has no way to refer to an environment variable in that field is refused for that server, with an error that names the target and the variable, rather than given a copy that needs a pasted value.

A remote server that authenticates by OAuth needs no secret at all: aireg writes its URL and the agent runs its own sign-in.

| Target | Reference | Where it expands |
|---|---|---|
| Claude Code | `${NAME}`, `${NAME:-default}` | `command`, `args`, `env`, `url`, `headers` |
| Codex | none; `env_vars = ["NAME"]` forwards a variable of the same name, `bearer_token_env_var` and `env_http_headers` name variables for headers | those three fields |
| Cursor | `${env:NAME}` | `command`, `args`, `env`, `url`, `headers` |
| OpenCode | `{env:NAME}` | every string in its configuration; an unset variable becomes an empty string without a warning |
| Gemini CLI | `$NAME`, `${NAME}`, `${NAME:-default}` | every string in `settings.json`. Gemini CLI also removes inherited variables whose names look like credentials before it starts a server, so a secret has to be named in the server's `env` |
| Grok Build | `${NAME}`, `${NAME:-default}` | `url`, `command`, `args`, `env`, `headers` |
| GitHub Copilot CLI | undocumented | — |

For Codex, aireg applies the rule Codex's own importer uses for other agents' configurations: an environment entry whose value is a reference to a variable of the same name becomes `env_vars`; an `Authorization: Bearer` header that refers to a variable becomes `bearer_token_env_var`; another header that refers to a variable becomes `env_http_headers`; and any other reference makes the server one Codex cannot take.

`aireg status` reports a required input whose variable is not set, by name only, the way `claude mcp list` already reports "Missing environment variables".

### Consent

Installing a server means every selected agent will start that command, so a server installs only after the person agrees to it, the way a plugin does today. aireg shows the exact launch or URL, the inputs it reads, the package and its pin, and the registry and namespace it came from. Without a terminal, `--trust` is required, and CI never installs a server without it. This matters most in a user's own scope: in testing, Claude Code, Codex, Cursor, OpenCode and Grok Build all started user-scope servers without asking, and OpenCode started project servers without asking too.

Whether new versions of this kind should be reviewed before they become active is a registry's own decision. The kind manifest leaves `x-registry-gated` false, so a personal registry is not forced through review; a team registry can gate it.

### Ownership, drift and removal

aireg writes each entry through the configuration edits it already uses to register plugins, and owns only the entries it wrote. The lockfile records a digest of each entry as written. aireg updates an entry only while it still equals that digest; an entry someone has edited shows as `edited` in `aireg status` and is left alone. An entry aireg did not write shows as `unmanaged`. Removing a server removes only aireg's own entry and leaves the rest of the file as it was.

Some files are shared. Claude Code, GitHub Copilot CLI and Grok Build all read a project's `.mcp.json`, so it is written once and owned once.

### Where each target keeps its servers

| Target | Project | User | Shape | Before a project server starts |
|---|---|---|---|---|
| Claude Code | `.mcp.json` | `~/.claude.json` (see below) | JSON `mcpServers` | it is pending until the person approves it |
| Codex | `.codex/config.toml` | `$CODEX_HOME/config.toml` | TOML `[mcp_servers.<name>]` | read only in a trusted project |
| Cursor | `.cursor/mcp.json` | `~/.cursor/mcp.json` | JSON `mcpServers` | approval, which an edit to the entry asks for again |
| OpenCode | `opencode.json` | `~/.config/opencode/opencode.json` | `mcp.<name>`, `type` `local` or `remote` | none |
| Gemini CLI | `.gemini/settings.json` | `$GEMINI_CLI_HOME/.gemini/settings.json` | JSON `mcpServers` | ignored in an untrusted folder |
| GitHub Copilot CLI | `.mcp.json` | `~/.copilot/mcp-config.json` | JSON `mcpServers` | skipped until the folder is trusted |
| Grok Build | `.grok/config.toml` | `$GROK_HOME/config.toml` | TOML `[mcp_servers.<name>]` | it asks the person to trust the folder; it also reads Claude Code's and Cursor's files, ranked below its own |

Claude Code keeps user-scope servers in `~/.claude.json`, a file it rewrites with its own state. aireg does not edit that file; for Claude Code's user scope it prints the `claude mcp add-json --scope user` command to run, and writes project servers to `.mcp.json`. When Claude Code is a selected target, aireg does not also write Grok Build's file for the same server, since Grok Build reads Claude Code's.

### Export

`aireg export mcp [<name>] [-g] [--for <target>]` prints the installed servers as the `{"mcpServers": {…}}` object most agents and host applications accept when a person pastes a server's configuration. `--secrets reference`, the default, writes each secret as a reference; `--secrets empty` writes it as an empty value, for an application that stores secrets itself and would otherwise keep the reference as literal text.

## Out of scope

- **Turning a server on or off for one session or one project.** That belongs to the application that starts the agent session. aireg installs and removes.
- **Editing an agent's own state file**, such as Claude Code's `~/.claude.json`. The agent rewrites it while it runs, so an outside edit can be lost or can lose the agent's own changes.
- **Running servers, proxies or gateways.** Hosted gateways that put many servers behind one endpoint solve a different problem and need a service; a registry here stays a set of files.
- **Signing a person in to a remote server.** Each agent runs its own OAuth flow and keeps its own tokens.
- **Snapshots of a server's tools**, to report when a new version adds or removes one. A later addition, as an optional file in a version.
- **A server that only Cargo can install.** It needs a one-time install outside aireg.

## Open questions

| Question | How to settle it |
|---|---|
| How GitHub Copilot CLI refers to an environment variable, and what it does with an unset one | An install test with a dummy server |
| Whether Codex prefers a project entry or a user entry with the same name | An install test in a trusted project |
| Whether Gemini CLI merges `mcpServers` from the user and project files per server | An install test |
| Whether to run an `npx` or `uvx` package from a cache aireg verifies, rather than trusting the package registry at every start | A design decision; the version pin and an install-time check come first |
| Whether agents beyond the built-in targets get servers | Each needs its own evidence, as a target's skills do |

## Sources

Read on 2026-10-29.

- MCP Registry: `internal/validators/schemas/2025-12-11.json` and `docs/reference/server-json/` at [modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry), commit `69374b0`; package types and versioning in its documentation.
- Claude Code: [code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp), "Environment variable expansion in `.mcp.json`"; `claude mcp list` and `claude mcp get` 2.1.312 against a sandboxed `.mcp.json`.
- Codex: `codex-rs/config/src/mcp_types.rs` and `codex-rs/external-agent-migration/src/mcp.rs` at [openai/codex](https://github.com/openai/codex) commit `9def09a`; `codex mcp add` 0.165.0, which writes `--env` values into `config.toml` as written.
- Cursor: [cursor.com/docs/context/mcp](https://cursor.com/docs/context/mcp), "Config interpolation".
- OpenCode: `packages/core/test/config/config.test.ts` at [sst/opencode](https://github.com/sst/opencode) commit `726cf09`.
- Gemini CLI: the configuration and MCP server pages of [geminicli.com/docs](https://geminicli.com/docs/).
- GitHub Copilot CLI: [Adding MCP servers](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers).
- Grok Build: [docs.x.ai/build/features/mcp-servers](https://docs.x.ai/build/features/mcp-servers.md).
- Microsoft APM and skillshare: their MCP install and sharing documentation.
- Incidents: Koi Security, [postmark-mcp](https://koi.ai/blog/postmark-mcp-npm-malicious-backdoor-email-theft); JFrog, [CVE-2025-6514 in mcp-remote](https://jfrog.com/blog/2025-6514-critical-mcp-remote-rce-vulnerability/).
