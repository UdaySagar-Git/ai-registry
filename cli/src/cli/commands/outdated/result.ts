import type { Watched } from "#cli/render/installed.ts";
import type { Scope } from "#core/store/paths.ts";

/** `aireg outdated`: what each registry publishes now against what is installed. */
export interface OutdatedResult {
  scope: Scope;
  artifacts: OutdatedArtifact[];
}

export interface OutdatedArtifact {
  name: string;
  registry: string;
  /** The version the manifest pins. */
  pinned?: string;
  /** Published from a watched folder, so `aireg update` never moves it; its next publish does. */
  watched?: Watched;
  /** Empty for one not installed yet. */
  current: string;
  latest: string;
  moved: boolean;
  /** Why it could not be checked, rather than known to be unchanged. */
  unchecked?: string;
  /** Published since the last install, under a registry or namespace the manifest takes whole. */
  added?: true;
  unpublished?: true;
}
