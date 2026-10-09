import { afterEach, describe, expect, vi } from "vitest";
import { emptyRegistryConfig, type Job } from "#core/config/model.ts";
import { writeConfig } from "#core/config/repository.ts";
import { AiregError } from "#core/errors.ts";
import { Printer } from "#core/output.ts";
import { test } from "#test/kit/fixtures.ts";
import type { CommandContext } from "./index.ts";
import { run } from "./job.ts";

const daemon = vi.hoisted(() => ({ withDaemon: vi.fn() }));
vi.mock("#daemon/service.ts", () => daemon);

let home: string;

function context(argv: string[], out: string[] = []): CommandContext {
  return {
    argv,
    cwd: home,
    printer: new Printer({
      format: "json",
      out: { write: (text: string) => out.push(text), isTTY: false },
    }),
    host: {
      version: "test",
      connectAccount: async () => {
        throw new Error("no host");
      },
      openRunStore: async () => {
        throw new Error("no host");
      },
    },
  };
}

test.beforeEach(async ({ tmp }) => {
  home = tmp;
  vi.stubEnv("AIREG_HOME", home);
  daemon.withDaemon.mockReset();
});

afterEach(async () => {
  vi.unstubAllEnvs();
});

describe("a job command that fails validation", () => {
  const failing = [
    ["add"],
    ["add", "--registry", "undeclared"],
    ["add", "--registry", "undeclared", "--interval", "5"],
    ["enable", "zz-nope"],
    ["disable", "zz-nope"],
    ["remove", "zz-nope"],
    ["start", "zz-nope"],
    ["retry"],
    ["cancel"],
    ["retry", "zz-nope"],
    ["cancel", "zz-nope"],
    ["runs", "zz-nope"],
  ];

  test("does not start the daemon", async () => {
    for (const argv of failing) {
      await expect(run(context(argv)), argv.join(" ")).rejects.toThrow(AiregError);
    }
    expect(daemon.withDaemon).not.toHaveBeenCalled();
  });
});

describe("job add --interval", () => {
  test.each(["600s", "1.5", "1e3", " 600"])(
    "refuses %j, which is not whole seconds",
    async (value) => {
      await expect(
        run(context(["add", "--registry", "undeclared", "--interval", value])),
      ).rejects.toThrow(/--interval must be a whole number of seconds/);
    },
  );
});

describe("a job named by a name other than its id", () => {
  const job: Job = {
    id: "job_contributed_1",
    name: "nightly",
    account: "acc_demo",
    schedule: { every: 300, enabled: true },
    steps: [
      { name: "pull", kind: "pull", needs: [], root: "/", select: [], policy: "on", extra: {} },
    ],
  };

  test("is removed by its id, which the output reports", async () => {
    const config = {
      ...emptyRegistryConfig(),
      accounts: [{ id: "acc_demo", registry: "acme" }],
      jobs: [job],
    };
    await writeConfig(config, 0);
    const sent: unknown[] = [];
    const client = {
      request: async (method: string, params: unknown) => {
        if (method === "state.snapshot") return { config: { ...config, revision: 1 } };
        sent.push(params);
        return {};
      },
    };
    daemon.withDaemon.mockImplementation((work: (client: unknown) => unknown) => work(client));
    const out: string[] = [];
    await run(context(["remove", "nightly"], out));
    expect(sent).toEqual([{ expectedRevision: 1, jobs: { remove: ["job_contributed_1"] } }]);
    expect(JSON.parse(out.join(""))).toEqual({ ok: true, data: { jobId: "job_contributed_1" } });
  });
});
