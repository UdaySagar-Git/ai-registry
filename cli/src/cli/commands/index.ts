import { quoted } from "#adapter/text.ts";
import { ADAPTER_COMMAND } from "#cli/commands/adapter/spec.ts";
import { ADD_COMMAND } from "#cli/commands/add/spec.ts";
import { AUTH_COMMAND } from "#cli/commands/auth/spec.ts";
import { CONFIG_COMMAND } from "#cli/commands/config/spec.ts";
import { CONSOLE_COMMAND } from "#cli/commands/console/spec.ts";
import { DAEMON_COMMAND } from "#cli/commands/daemon/spec.ts";
import { DOCTOR_COMMAND } from "#cli/commands/doctor/spec.ts";
import { INIT_COMMAND } from "#cli/commands/init/spec.ts";
import { INSTALL_COMMAND } from "#cli/commands/install/spec.ts";
import { JOB_COMMAND } from "#cli/commands/job/spec.ts";
import { LIST_COMMAND } from "#cli/commands/list/spec.ts";
import { LOGS_COMMAND } from "#cli/commands/logs/spec.ts";
import { OUTDATED_COMMAND } from "#cli/commands/outdated/spec.ts";
import { PUBLISH_COMMAND } from "#cli/commands/publish/spec.ts";
import { REGISTRY_COMMAND } from "#cli/commands/registry/spec.ts";
import { REMOVE_COMMAND } from "#cli/commands/remove/spec.ts";
import { SEARCH_COMMAND } from "#cli/commands/search/spec.ts";
import { SELF_COMMAND } from "#cli/commands/self/spec.ts";
import { SHOW_COMMAND } from "#cli/commands/show/spec.ts";
import { STATUS_COMMAND } from "#cli/commands/status/spec.ts";
import { SYNC_COMMAND } from "#cli/commands/sync/spec.ts";
import { TARGETS_COMMAND } from "#cli/commands/targets/spec.ts";
import { UNLOCK_COMMAND } from "#cli/commands/unlock/spec.ts";
import { UPDATE_COMMAND } from "#cli/commands/update/spec.ts";
import { WATCH_COMMAND } from "#cli/commands/watch/spec.ts";
import { NAMESPACE } from "#cli/options.ts";
import type { CommandContribution, OptionSpec } from "#core/host/extend.ts";
import { contributedCommands } from "#core/host/load.ts";
import type { Printer } from "#core/output.ts";
import { type Command, GROUPS, type Group } from "./command.ts";

/** Every built-in command, in the order `--help` lists each group. */
export const COMMANDS: readonly Command[] = [
  { ...INIT_COMMAND, load: () => import("./init.ts") },
  { ...REGISTRY_COMMAND, load: () => import("./registry.ts") },
  { ...AUTH_COMMAND, load: () => import("./auth.ts") },
  { ...SEARCH_COMMAND, load: () => import("./search.ts") },
  { ...ADD_COMMAND, load: () => import("./add.ts") },
  { ...REMOVE_COMMAND, load: () => import("./remove.ts") },
  { ...INSTALL_COMMAND, load: () => import("./install.ts") },
  { ...UPDATE_COMMAND, load: () => import("./update.ts") },
  { ...SHOW_COMMAND, load: () => import("./show.ts") },
  { ...CONSOLE_COMMAND, load: () => import("./console.ts") },
  { ...STATUS_COMMAND, load: () => import("./status.ts") },
  { ...LIST_COMMAND, load: () => import("./list.ts") },
  { ...OUTDATED_COMMAND, load: () => import("./outdated.ts") },
  { ...TARGETS_COMMAND, load: () => import("./targets.ts") },
  { ...SYNC_COMMAND, load: () => import("./sync.ts") },
  { ...PUBLISH_COMMAND, load: () => import("./publish.ts") },
  { ...WATCH_COMMAND, load: () => import("./watch.ts") },
  { ...JOB_COMMAND, load: () => import("./job.ts") },
  { ...DAEMON_COMMAND, load: () => import("./daemon.ts") },
  { ...CONFIG_COMMAND, load: () => import("./config.ts") },
  { ...DOCTOR_COMMAND, load: () => import("./doctor.ts") },
  { ...UNLOCK_COMMAND, load: () => import("./unlock.ts") },
  { ...ADAPTER_COMMAND, load: () => import("./adapter.ts") },
  { ...LOGS_COMMAND, load: () => import("./logs.ts") },
  { ...SELF_COMMAND, load: () => import("./self.ts") },
];

/** A built-in command by its name, for code that reads specs by name. */
export function builtin(name: string): Command {
  const command = COMMANDS.find((c) => c.name === name);
  if (command === undefined) throw new Error(`No built-in command named ${name}`);
  return command;
}

function lookupBuiltin(name: string): Command | undefined {
  return COMMANDS.find(
    (c) => c.name === name || c.aliases?.includes(name) === true || c.formerly?.includes(name),
  );
}

function asGroup(group: string): Group {
  return (GROUPS as readonly string[]).includes(group) ? (group as Group) : "Maintain";
}

function fromContribution(command: CommandContribution): Command {
  return {
    name: command.name,
    ...(command.aliases === undefined ? {} : { aliases: [...command.aliases] }),
    summary: command.summary,
    group: asGroup(command.group),
    usage: command.usage ?? [
      `aireg ${command.name}${command.actions === undefined ? "" : " <action>"} [options]`,
    ],
    ...(command.examples === undefined ? {} : { examples: command.examples }),
    ...(command.docs === undefined ? {} : { docs: command.docs }),
    ...(command.options === undefined ? {} : { options: command.options }),
    ...(command.actions === undefined
      ? {}
      : { actions: command.actions.map((name) => ({ name })) }),
    load: command.load,
  };
}

/** Names aireg's own commands answer to, so a kind or an adapter's command cannot have them. */
export const RESERVED: ReadonlySet<string> = new Set([
  "help",
  ...COMMANDS.flatMap((c) => [c.name, ...(c.aliases ?? []), ...(c.formerly ?? [])]),
]);

/** A kind or an adapter's command that a command with the same name hides. */
export interface Hidden {
  readonly name: string;
  readonly message: string;
  readonly hint: string;
}

const PRECEDENCE = "aireg's own commands come first.";

export function hiddenKind(name: string): Hidden {
  return {
    name,
    message: `The kind ${quoted(name)} has the same name as a command, so \`aireg ${name}\` runs the command.`,
    hint: `Rename the kind in registry.json, since ${PRECEDENCE}`,
  };
}

/** Built-ins win over adapters' commands, and both over kinds; `hidden` is what lost. */
async function table(cwd: string): Promise<{ commands: Command[]; hidden: Hidden[] }> {
  const commands = [...COMMANDS];
  const hidden: Hidden[] = [];
  for (const command of (await contributedCommands()).map(fromContribution)) {
    if (!RESERVED.has(command.name)) {
      commands.push(command);
      continue;
    }
    hidden.push({
      name: command.name,
      message: `An adapter's command ${quoted(command.name)} has the same name as a built-in command, so \`aireg ${command.name}\` runs the built-in one.`,
      hint: `Rename the command in its adapter, since ${PRECEDENCE}`,
    });
  }
  const taken = new Set([...RESERVED, ...commands.flatMap((c) => [c.name, ...(c.aliases ?? [])])]);
  for (const kind of await kindCommands(cwd)) {
    if (taken.has(kind.name)) hidden.push(hiddenKind(kind.name));
    else commands.push(kind);
  }
  return { commands, hidden };
}

/** Every command `--help` and `--map` list, with the kinds the registry here holds. */
export async function allCommands(cwd = process.cwd()): Promise<readonly Command[]> {
  return (await table(cwd)).commands;
}

export async function warnHidden(printer: Printer, name?: string): Promise<void> {
  const hidden = (await table(process.cwd())).hidden.filter(
    (entry) => name === undefined || entry.name === name,
  );
  printHidden(printer, hidden);
}

export function printHidden(printer: Printer, hidden: readonly Hidden[]): void {
  for (const entry of hidden) printer.warning(entry.message);
  for (const hint of new Set(hidden.map((entry) => entry.hint))) printer.hint(hint);
}

export async function lookup(name: string, cwd = process.cwd()): Promise<Command | undefined> {
  const own = lookupBuiltin(name);
  if (own !== undefined) return own;
  return (await allCommands(cwd)).find(
    (c) => c.name === name || c.aliases?.includes(name) === true,
  );
}

const KIND_NEW: readonly OptionSpec[] = [
  NAMESPACE,
  {
    flag: "--set",
    value: "<key>=<value>",
    multiple: true,
    describe: "A field to fill in, with dots for nested ones (repeatable)",
  },
  {
    flag: "--file",
    value: "<file>",
    describe: "For a kind with more than one layout, the file to create",
  },
  {
    flag: "--from",
    value: "<path>",
    multiple: true,
    describe: "An existing skill folder or agent file to copy in (repeatable)",
  },
  {
    flag: "--name",
    value: "<name>",
    describe: "With --from, a new name for the artifact copied in",
  },
];

/** A kind the registry here holds is a command of its own: `aireg agent new triage`. */
async function kindCommands(cwd: string): Promise<Command[]> {
  const { findRegistry } = await import("#core/filespec/write/init.ts");
  const { kindsOf } = await import("#core/filespec/write/kinds.ts");
  return Object.entries(await kindsOf(findRegistry(cwd))).map(([name, manifest]) => {
    const a = /^[aeiou]/.test(name) ? "an" : "a";
    const spec: Command = {
      name,
      summary: `Create ${a} ${name}, or start its next version`,
      group: "Share",
      usage: [`aireg ${name} <action> [options]`],
      examples: [
        {
          command: `aireg ${name} new pr-review --namespace engineering`,
          what: `a new ${name}`,
        },
        { command: `aireg ${name} bump pr-review minor`, what: "start its next minor version" },
      ],
      docs: "kinds",
      actions: [
        {
          name: "new",
          summary: `Create ${a} ${name}`,
          usage: [
            `aireg ${name} new [<name>] [options]`,
            `aireg ${name} new --from <path>... [options]`,
          ],
          options: KIND_NEW,
        },
        {
          name: "bump",
          summary: `Start the next version of ${a} ${name}`,
          usage: [`aireg ${name} bump <name> [patch | minor | major | <version>] [options]`],
          maxArguments: 2,
          options: [NAMESPACE],
        },
      ],
      load: async () => {
        const { runKind } = await import("./kind.ts");
        return { run: (context) => runKind(spec, manifest, context) };
      },
    };
    return spec;
  });
}
