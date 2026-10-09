import { gitTimeoutMs } from "./env.ts";
import { type ExecResult, exec } from "./process.ts";

/**
 * Git on a person's own repository. Inside a hook its environment names that repository,
 * so it is passed through; only prompts and optional index locks are turned off.
 */
export function gitIn(cwd: string, args: readonly string[]): Promise<ExecResult> {
  return exec("git", args, {
    cwd,
    timeoutMs: gitTimeoutMs(),
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
  });
}
