import type { Printer } from "#core/term/printer.ts";
import { type CommandContext, type CommandSpec, runAction } from "./command.ts";

/** What a run returns when it printed as it went, as `--follow` does, leaving nothing to emit. */
export const STREAMED: unique symbol = Symbol("streamed");

/** One action: what it does, as data, and how a person reads that data. */
export interface Action<O, R extends object> {
  run(options: O, context: CommandContext): Promise<R | typeof STREAMED>;
  /** Under `--json` the result itself is printed, so this never runs there. */
  text(result: R, printer: Printer, options: O): void;
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
  if (result !== STREAMED) {
    emit(context.printer, result, (shown, printer) => chosen.text(shown, printer, options));
  }
}

/** The one place a result is printed: the `--json` envelope, or the text a person reads. */
function emit<R extends object>(
  printer: Printer,
  result: R,
  text: (result: R, printer: Printer) => void,
): void {
  if (printer.format === "json") printer.json({ ok: true, data: result });
  else text(result, printer);
}
