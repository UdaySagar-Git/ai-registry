import { describe, expect, it } from "vitest";
import { actionOf, builtin } from "#cli/commands/index.ts";
import { parse } from "#cli/options.ts";
import { isStepPolicy } from "#core/config/model.ts";
import * as actions from "#core/console/actions.ts";

/** Read as `aireg` reads it: the command, its action when it has them, then the options. */
function accepted(argv: readonly string[]): void {
  const [name = "", ...rest] = argv;
  const spec = builtin(name);
  const action = spec.actions?.find((each) => each.name === rest[0]);
  // A command that takes no options of its own only runs through an action.
  if (spec.options === undefined) expect(action, `an action of aireg ${name}`).toBeDefined();
  const accepts = action === undefined ? spec : actionOf(spec, action.name);
  const { own } = parse<Record<string, unknown>>(
    action === undefined ? rest : rest.slice(1),
    accepts,
  );
  for (const option of accepts.options ?? []) {
    const value = own[option.flag.slice(2)];
    if (option.value === "<policy>" && typeof value === "string") {
      expect(isStepPolicy(value), `${option.flag} ${value}`).toBe(true);
    }
  }
}

describe("console actions", () => {
  const commands = [
    actions.pullLatest("acme", "project"),
    actions.pullLatest(undefined, "user"),
    actions.publish(["engineering/pr-review"], "engineering", "user"),
    actions.runJob("job_skills_acme"),
    actions.setJobEnabled("job_skills_acme", true),
    actions.setJobEnabled("job_skills_acme", false),
    actions.retryRun("run_1"),
  ];

  it.each(commands)("$display is a command aireg takes", (command) => {
    expect(command.display).toBe(`aireg ${command.argv.join(" ")}`);
    accepted(command.argv);
  });
});
