import { plural } from "#adapter/text.ts";
import { stateTone } from "#core/console/state-style.ts";
import type { Printer } from "#core/output.ts";
import type { ArtifactStatus, LinkState } from "#core/plan/status.ts";
import { type Scope, scopeName } from "#core/store/paths.ts";
import { table } from "#core/term/table.ts";
import { heading, type Installed, identity } from "./installed.ts";

function cell(printer: Printer, seen: LinkState | undefined): string {
  const { style } = printer;
  if (seen === undefined) return style.dim("-");
  if (seen === "linked") return style.green("✓");
  return seen === "missing" ? style.red(seen) : style.yellow(seen);
}

export function renderStatus(
  printer: Printer,
  statuses: readonly ArtifactStatus[],
  rows: readonly Installed[],
  scope: Scope,
): void {
  if (statuses.length === 0) {
    printer.info(`Nothing is installed in ${scopeName(scope)}.`);
    return;
  }

  const byName = new Map(rows.map((row) => [row.name, row]));
  // A watched artifact is its harness's own folder, which aireg reads and never links.
  const watching = (item: ArtifactStatus): string | undefined =>
    byName.get(item.name)?.watched?.harness;
  const harnesses = [
    ...new Set(
      statuses.flatMap((item) => {
        const linked = Object.keys(item.harnesses);
        const watched = watching(item);
        return watched === undefined ? linked : [...linked, watched];
      }),
    ),
  ].sort();
  const of = (item: ArtifactStatus): Installed =>
    byName.get(item.name) ?? {
      name: item.name,
      shown: item.name,
      kind: "",
      registry: "",
      address: "",
      ref: "",
      pinned: false,
      targets: [],
    };

  heading(printer, statuses.length, scope);
  table(
    printer,
    [
      ...identity(printer, of),
      ...harnesses.map((harness) => ({
        header: harness,
        value: (item: ArtifactStatus) =>
          item.harnesses[harness] === undefined && watching(item) === harness
            ? printer.style.dim("watched")
            : cell(printer, item.harnesses[harness]),
      })),
      {
        header: "state",
        value: (item: ArtifactStatus) => printer.style[stateTone(item.state)](item.state),
      },
      {
        header: "detail",
        value: (item: ArtifactStatus) =>
          item.state === "ok" || item.detail === undefined ? "" : printer.style.dim(item.detail),
        optional: true,
      },
    ],
    statuses,
  );

  const attention = statuses.filter((item) => item.state !== "ok").length;
  printer.info();
  if (attention === 0) {
    printer.success("Everything matches the lockfile.");
    return;
  }
  printer.info(`${plural(attention, "artifact")} need${attention === 1 ? "s" : ""} attention.`);

  // An edit is the one state `install` will not repair: it refuses to overwrite
  // an edit, so point at `sync`, which reconciles one.
  const flag = scope === "user" ? " -g" : "";
  const edited = statuses.some((item) => item.state === "edited");
  const absent = statuses.some((item) => item.state === "missing" || item.state === "dangling");
  if (edited) {
    printer.hint(
      `Run \`aireg sync${flag}\` to compare the edits with the registry` +
        (absent ? `, and \`aireg install${flag}\` to restore what is missing.` : "."),
    );
  } else if (absent) {
    const repairable = statuses.some(
      (item) => (item.state === "missing" || item.state === "dangling") && item.blocked !== true,
    );
    printer.hint(
      repairable
        ? `Run \`aireg install${flag}\` to restore what is missing.`
        : `Move what is in the way, or give one artifact another name with \`as:\` in the manifest, then run \`aireg install${flag}\`.`,
    );
  }
}
