import { readFile } from "node:fs/promises";
import { exec } from "#core/process.ts";

const EXEC_MS = 2_000;

function isDaemonCommand(command: string): boolean {
  return command.includes("--internal-daemon");
}

async function commandLine(pid: number): Promise<string | undefined> {
  try {
    return (await readFile(`/proc/${String(pid)}/cmdline`, "utf8")).replace(/\0/g, " ").trim();
  } catch {
    if (process.platform === "linux") return undefined;
  }
  const { code, stdout } = await exec("ps", ["-p", String(pid), "-o", "args="], {
    timeoutMs: EXEC_MS,
  });
  const line = stdout.trim();
  return code !== 0 || line === "" ? undefined : line;
}

export async function isDaemonProcess(pid: number): Promise<boolean> {
  const command = await commandLine(pid);
  return command !== undefined && isDaemonCommand(command);
}

/** Pids that have this unix socket open. Empty when lsof is missing or the path is idle. */
export async function socketPids(endpoint: string): Promise<number[]> {
  if (process.platform === "win32") return [];
  const { code, stdout } = await exec("lsof", ["-t", "-U", "--", endpoint], { timeoutMs: EXEC_MS });
  if (code !== 0) return [];
  return stdout
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}
