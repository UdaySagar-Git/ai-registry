import type { ArtifactKind } from "#adapter/kinds.ts";
import type { Changes } from "#engine/publish/changes.ts";
import type { Skipped } from "#engine/publish/exports.ts";

/** One artifact the run planned, sent or not. */
interface PublishedArtifact {
  name: string;
  kind: ArtifactKind;
  /** The registry's name, or for `--to <folder>`, the folder as `--to` gave it. */
  registry: string;
  namespace: string;
  /** `null` for an artifact the registry does not hold yet. */
  from: string | null;
  version: string;
  /** The content's identity, leaving out the version. */
  digest: string;
  belowLatest: boolean;
  published: boolean;
  dependsOn: { to: string }[];
  /** An agent's files, when it has more than its entry. */
  files?: string[];
  filesChanged?: Changes["files"];
  dependsOnChanged?: Changes["dependsOn"];
}

/** `aireg publish`: what was planned and sent, and what was left out. */
export interface PublishReport {
  dryRun: boolean;
  /** Where `--to` or `publish.to` sent exports; `null` when each went where it came from. */
  target: { registry: string; namespace: string } | null;
  artifacts: PublishedArtifact[];
  skipped: Skipped[];
}
