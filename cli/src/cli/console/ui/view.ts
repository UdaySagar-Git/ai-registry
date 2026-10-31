import { type BuiltInView, isBuiltInView } from "#core/console/model.ts";
import type { PanelContribution } from "#core/host/panel.ts";

export const VIEW_LABELS: Readonly<Record<BuiltInView, string>> = {
  overview: "Overview",
  artifacts: "Artifacts",
  jobs: "Jobs",
  accounts: "Registries",
  settings: "Settings",
};

// biome-ignore lint/suspicious/noExplicitAny: each panel names its own state.
export type AnyPanel = PanelContribution<any>;

/** What the selected tab shows: one of aireg's own views, or a tab an adapter contributed. */
export type View = { kind: "built-in"; id: BuiltInView } | { kind: "panel"; panel: AnyPanel };

export function viewOf(id: string, panels: readonly AnyPanel[]): View {
  const panel = panels.find((contribution) => contribution.id === id);
  if (panel !== undefined) return { kind: "panel", panel };
  // Only a tab sets the view, and every tab is a built-in view or a panel.
  return { kind: "built-in", id: isBuiltInView(id) ? id : "overview" };
}
