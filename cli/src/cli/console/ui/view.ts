import type { PanelContribution } from "#core/host/panel.ts";

/** aireg's own views, in tab order. */
export const BUILT_IN_VIEWS = ["overview", "artifacts", "jobs", "accounts", "settings"] as const;

export type BuiltInView = (typeof BUILT_IN_VIEWS)[number];

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

/** A panel wins a tab id it shares with a built-in view. */
export function viewOf(id: string, panels: readonly AnyPanel[]): View {
  const panel = panels.find((contribution) => contribution.id === id);
  if (panel !== undefined) return { kind: "panel", panel };
  // Only a tab sets the view, and every tab is a built-in view or a panel.
  return { kind: "built-in", id: isBuiltInView(id) ? id : "overview" };
}

function isBuiltInView(id: string): id is BuiltInView {
  return (BUILT_IN_VIEWS as readonly string[]).includes(id);
}
