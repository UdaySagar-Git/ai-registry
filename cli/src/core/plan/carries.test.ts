import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect } from "vitest";
import { test } from "#test/kit/fixtures.ts";
import { carries, describeCarried } from "./carries.ts";

async function put(root: string, path: string, body: string): Promise<void> {
  await mkdir(join(root, path, ".."), { recursive: true });
  await writeFile(join(root, path), body);
}

describe("carries", () => {
  test("finds nothing in a plugin of skills alone", async ({ tmp }) => {
    await put(tmp, "skills/hello/SKILL.md", "# hello\n");
    await put(tmp, ".claude-plugin/plugin.json", '{"name":"tools","skills":"./skills/"}');
    expect(await carries(tmp)).toEqual([]);
  });

  test("finds what a harness starts from the plugin's own files", async ({ tmp }) => {
    await put(tmp, "hooks/hooks.json", '{"hooks":{}}');
    await put(tmp, ".mcp.json", '{"mcpServers":{}}');
    await put(tmp, ".lsp.json", "{}");
    await put(tmp, "monitors/monitors.json", "[]");
    expect(await carries(tmp)).toEqual(["hooks", "mcpServers", "lspServers", "monitors"]);
  });

  test("finds what a manifest declares inline", async ({ tmp }) => {
    await put(
      tmp,
      ".codex-plugin/plugin.json",
      JSON.stringify({ name: "tools", mcpServers: "./servers.json" }),
    );
    await put(
      tmp,
      ".claude-plugin/plugin.json",
      JSON.stringify({ name: "tools", hooks: {}, experimental: { monitors: [] } }),
    );
    expect(await carries(tmp)).toEqual(["hooks", "mcpServers", "monitors"]);
  });

  test("reads past a manifest that is not JSON", async ({ tmp }) => {
    await put(tmp, "plugin.json", "{ not json");
    await put(tmp, ".mcp.json", "{}");
    expect(await carries(tmp)).toEqual(["mcpServers"]);
  });

  test("finds nothing in a single file", async ({ tmp }) => {
    await put(tmp, "agent.md", "# agent\n");
    expect(await carries(join(tmp, "agent.md"))).toEqual([]);
  });
});

describe("describeCarried", () => {
  test("names each in words", () => {
    expect(describeCarried(["hooks", "mcpServers"])).toBe("hooks and MCP servers");
  });
});
