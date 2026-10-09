import { join } from "node:path";
import { toolHome } from "#core/store/paths.ts";
import { BINARY_NAME } from "./urls.ts";

export function cliRoot(env: NodeJS.ProcessEnv = process.env): string {
  return join(toolHome(env), "cli");
}

export function versionDir(version: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(cliRoot(env), version);
}

export function currentLink(env: NodeJS.ProcessEnv = process.env): string {
  return join(cliRoot(env), "current");
}

/** One standalone executable per version; there is no package tree around it. */
export function versionBin(version: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(versionDir(version, env), BINARY_NAME);
}

export function binDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(toolHome(env), "bin");
}

export function shimPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(binDir(env), BINARY_NAME);
}

export function updateCheckPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(toolHome(env), "state", "update-check.json");
}
