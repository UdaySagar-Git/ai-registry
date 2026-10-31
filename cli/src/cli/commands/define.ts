import type { Printer } from "#core/term/printer.ts";
import { type CommandContext, type CommandSpec, runAction } from "./command.ts";

/** What a run returns when it printed as it went, as `--follow` does, leaving nothing to emit. */
export const STREAMED: unique symbol = Symbol("streamed");

/** One action: what it does, as data, and how a person reads that data. */
export interface Action<O, R extends object> {
  run(options: O, context: CommandContext): Promise<R | typeof STREAMED>;
  /** Under `--json` the data is printed instead, so this never runs there. */
  text(result: R, printer: Printer, options: O): void;
  /** What `--json` prints, when the text needs facts the published data leaves out. */
  data?(result: R): object;
  /** False for a check that ran and found problems: its data still prints, under `ok: false`. */
  ok?(result: R): boolean;
}

/** A command with no actions: argv to options, then its one result, printed once. */
interface SingleCommand<O, R extends object> extends Action<O, R> {
  spec: CommandSpec;
  /** Refuses a command line before anything is read or written. */
  parse(argv: string[]): O;
}

/** A command with actions: argv to the action and its options, then that action's result. */
interface ActionCommand<O> {
  spec: CommandSpec;
  /** Refuses a command line before anything is read or written. */
  parse(argv: string[]): { action: string; options: O };
  actions: Readonly<Record<string, Action<O, object>>>;
}

interface CommandModule {
  run(context: CommandContext): Promise<void>;
}

/** Keeps each action's result type, which a record of actions would widen. */
export function action<O, R extends object>(definition: Action<O, R>): Action<O, R> {
  return definition;
}

export function defineCommand<O, R extends object>(definition: SingleCommand<O, R>): CommandModule;
export function defineCommand<O>(definition: ActionCommand<O>): CommandModule;
export function defineCommand<O>(
  definition: SingleCommand<O, object> | ActionCommand<O>,
): CommandModule {
  if (!("actions" in definition)) {
    return {
      run: (context) => perform(definition, definition.parse(context.argv), context),
    };
  }
  return {
    async run(context) {
      const { action: name, options } = definition.parse(context.argv);
      const handlers = Object.fromEntries(
        Object.entries(definition.actions).map(([key, chosen]) => [
          key,
          () => perform(chosen, options, context),
        ]),
      );
      await runAction(definition.spec, name, handlers);
    },
  };
}

async function perform<O>(
  chosen: Action<O, object>,
  options: O,
  context: CommandContext,
): Promise<void> {
  const result = await chosen.run(options, context);
  if (result === STREAMED) return;
  if (context.printer.format === "json") {
    context.printer.json({
      ok: chosen.ok?.(result) ?? true,
      data: chosen.data?.(result) ?? result,
    });
  } else {
    chosen.text(result, context.printer, options);
  }
}
