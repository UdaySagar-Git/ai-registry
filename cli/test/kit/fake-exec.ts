import type { ExecResult } from "#core/process.ts";
import type { Exec } from "#daemon/autostart/model.ts";

/** Records calls and answers from a table keyed by the joined command line; unlisted calls exit 0. */
export function fakeExec(answers: Record<string, Partial<ExecResult>> = {}): {
  exec: Exec;
  calls: string[];
  answer(line: string, result: Partial<ExecResult>): void;
} {
  const calls: string[] = [];
  const table = new Map(Object.entries(answers));
  return {
    calls,
    answer: (line, result) => table.set(line, result),
    exec: async (file, args) => {
      const line = [file, ...args].join(" ");
      calls.push(line);
      return { code: 0, stdout: "", stderr: "", ...table.get(line) };
    },
  };
}
