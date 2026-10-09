import { realpath } from "node:fs/promises";
import { join } from "node:path";
import { readRegular } from "#adapter/files.ts";
import { list } from "#adapter/text.ts";
import { isRecord } from "#core/fields.ts";
import { isDirectory } from "#core/fs/tree.ts";
import type { Lock } from "#core/lock.ts";
import type { Roots } from "#core/store/paths.ts";
import type { Plan } from "./model.ts";

/**
 * What a harness starts on its own from a plugin it loads: commands that run as you, not
 * instructions an agent reads. Named by the plugin manifest key that declares each.
 */
export type Carried = "hooks" | "mcpServers" | "lspServers" | "monitors";

const ORDER: readonly Carried[] = ["hooks", "mcpServers", "lspServers", "monitors"];

const WORDS: Record<Carried, string> = {
  hooks: "hooks",
  mcpServers: "MCP servers",
  lspServers: "LSP servers",
  monitors: "monitors",
};

/** The default files Claude Code, Codex and the Agent Plugins layout read each from. */
const FILES: readonly [string, Carried][] = [
  ["hooks/hooks.json", "hooks"],
  [".mcp.json", "mcpServers"],
  [".lsp.json", "lspServers"],
  ["monitors/monitors.json", "monitors"],
];

const MANIFESTS = [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", "plugin.json"];

function declared(manifest: Record<string, unknown>): Carried[] {
  const experimental = isRecord(manifest.experimental) ? manifest.experimental : {};
  return ORDER.filter(
    (key) => (manifest[key] ?? (key === "monitors" ? experimental.monitors : undefined)) != null,
  );
}

/** What the plugin at `root` would have a harness start; empty for anything that is not a folder. */
export async function carries(root: string): Promise<Carried[]> {
  const dir = await realpath(root).catch(() => undefined);
  if (dir === undefined || !(await isDirectory(dir))) return [];
  const found = new Set<Carried>();
  const verified = new Set<string>();
  for (const [path, what] of FILES) {
    const file = await readRegular(dir, path, verified);
    // A harness follows a link where this read does not, so a linked file still counts.
    if (file.kind === "file" || (file.kind === "refused" && file.reason === "is a symlink")) {
      found.add(what);
    }
  }
  for (const path of MANIFESTS) {
    const file = await readRegular(dir, path, verified);
    if (file.kind !== "file") continue;
    try {
      const manifest: unknown = JSON.parse(file.bytes.toString("utf8"));
      if (isRecord(manifest)) for (const what of declared(manifest)) found.add(what);
    } catch {
      // A harness refuses a manifest it cannot parse, so it starts nothing from it.
    }
  }
  return ORDER.filter((what) => found.has(what));
}

/** `hooks and MCP servers`. */
export function describeCarried(carried: readonly Carried[]): string {
  return list(carried.map((what) => WORDS[what]));
}

/** Plugins this plan installs or updates that carry something a harness starts on its own. */
export async function carriedBy(
  plan: Plan,
  lock: Lock | undefined,
  roots: Roots,
): Promise<{ name: string; carries: Carried[] }[]> {
  const names = new Set(
    plan.actions.flatMap((action) =>
      action.kind === "clone" || action.kind === "link" ? [action.name] : [],
    ),
  );
  const out: { name: string; carries: Carried[] }[] = [];
  for (const name of [...names].sort()) {
    const row = lock?.artifacts[name];
    if (row?.kind !== "plugin") continue;
    const what = await carries(join(roots.base, row.path));
    if (what.length > 0) out.push({ name, carries: what });
  }
  return out;
}
