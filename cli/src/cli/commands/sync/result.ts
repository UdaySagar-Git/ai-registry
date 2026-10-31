import type { ArtifactKind } from "#adapter/kinds.ts";
import type { ItemOutcome, RunCounts, RunMode, RunState, RunTrigger } from "#core/run/model.ts";
import type { Scope } from "#core/store/paths.ts";
import type { Disposition } from "#core/sync/model.ts";
import type { SyncOperation } from "#core/sync/policy.ts";

/** One installed artifact, as `--dry-run` found the two sides. */
interface PreviewItem {
  name: string;
  kind: ArtifactKind;
  /** Its address in the registry, POSIX separators. */
  path: string;
  disposition: Disposition;
  /** A side with no bytes, such as a registry that never published it, has no digest. */
  digests: { base?: string; local?: string; upstream?: string };
  detail?: string;
  /** Why the registry would not serve it, when it would not. */
  failure?: { code: string; retryable: boolean };
  registry: string;
}

/** A skill or agent in a target folder that the scope does not install. */
interface Found {
  name: string;
  kind: ArtifactKind;
  /** Its folder, relative to the scope. */
  path: string;
  target: string;
}

interface Written extends Found {
  /** Where it would sit in a registry laid out the standard way. */
  suggestedPath: string;
}

/** `aireg sync --dry-run`. */
export interface SyncPreview {
  dryRun: true;
  scope: Scope;
  artifacts: PreviewItem[];
  local: Written[];
  undeclared: Found[];
  linkable: Found[];
  changed: Found[];
  kept: Found[];
}

/** One item a run changed, left for you, or failed on, as the text lists it. */
export interface SettledArtifact {
  name: string;
  kind?: ArtifactKind;
  outcome: ItemOutcome;
  operation?: SyncOperation;
  disposition?: Disposition;
}

interface SyncedRegistry {
  registry: string;
  id: string;
  state: RunState;
  counts: RunCounts;
  artifacts: SettledArtifact[];
  /** What the run did to your own files, or left undone. */
  warnings: string[];
}

/** `aireg sync`: a run per registry. */
export interface SyncRuns {
  dryRun: false;
  scope: Scope;
  runs: SyncedRegistry[];
}

/** A run record as the daemon sends it, each field that is not set left out. */
export interface SentRun {
  id: string;
  jobId?: string;
  accountId: string;
  configRevision: number;
  mode: RunMode;
  trigger: RunTrigger;
  state: RunState;
  step?: string;
  requestedAtMs: number;
  startedAtMs?: number;
  deadlineAtMs: number;
  finishedAtMs?: number;
  counts: RunCounts;
  errorCode?: string;
  retryable: boolean;
}

/** `aireg sync resolve`: its run once finished, and the artifacts it settled. */
export interface SyncResolved {
  run: SentRun;
  artifacts: SettledArtifact[];
}
