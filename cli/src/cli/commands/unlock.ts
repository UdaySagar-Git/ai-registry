import { quoted } from "#adapter/text.ts";
import { parse } from "#cli/options.ts";
import { AiregError, ErrorCode } from "#core/errors.ts";
import { breakLease, LeaseError, readLease } from "#core/lease.ts";
import { scopeName } from "#core/store/paths.ts";
import { ago } from "#core/term/format.ts";
import { scopeRoots } from "#engine/pipeline.ts";
import { builtin, type CommandContext } from "./index.ts";

/** Breaking a lease while its holder still writes corrupts the scope. */
export async function run(context: CommandContext): Promise<void> {
  const { common, positionals } = parse(context.argv, builtin("unlock"));
  const roots = scopeRoots(common, context.cwd);
  const holder = await readLease(roots);
  const where = scopeName(roots.scope);
  const id = positionals[0];

  if (holder === undefined && id !== undefined) {
    throw new AiregError(`No lock with id ${quoted(id)}: nothing is writing to ${where}.`, {
      code: ErrorCode.Usage,
    });
  }
  if (holder === undefined) {
    if (context.printer.format === "json") {
      context.printer.json({ ok: true, data: { scope: roots.scope, held: false } });
    } else {
      context.printer.info(`Nothing is writing to ${where}.`);
    }
    return;
  }

  if (id === undefined) {
    if (context.printer.format === "json") {
      context.printer.json({ ok: true, data: { scope: roots.scope, held: true, holder } });
      return;
    }
    context.printer.info(
      `Process ${holder.pid} on ${holder.host} started writing to ${where} ${ago(holder.acquiredAtMs)}.`,
    );
    // Showing the holder is the answer asked for, so it exits 0 as `--json` does.
    context.printer.hint(
      `If that process has stopped, run \`aireg unlock ${holder.id}\` to clear its write lock.`,
    );
    return;
  }

  try {
    const broken = await breakLease(roots, id);
    // Never silent: an undocumented workaround is worse than a logged one.
    context.printer.warning(
      `Cleared the write lock held by process ${broken.pid} on ${broken.host}.`,
    );
    if (context.printer.format === "json") {
      context.printer.json({ ok: true, data: { scope: roots.scope, broken } });
    }
  } catch (error) {
    if (error instanceof LeaseError) {
      throw new AiregError(error.message, { code: ErrorCode.Usage, hint: error.hint });
    }
    throw error;
  }
}
