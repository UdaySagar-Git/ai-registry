import type { LayoutId } from "#adapter/layouts/ids.ts";
import type { Outcome } from "#cli/render/plan.ts";

/** `aireg add`: what was added to the manifest, and what the run changed. */
export interface AddResult extends Outcome {
  registry: string;
  /** The full names added to the manifest. */
  artifacts: string[];
  /** For a source that is not a registry. */
  layout?: LayoutId;
  /** Each artifact installed only because others depend on it, to their names. */
  dependencies: Record<string, string[]>;
  /** The background job that keeps a user scope install current. */
  jobId?: string;
}
