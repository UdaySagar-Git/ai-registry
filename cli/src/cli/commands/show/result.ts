import type { ArtifactKind } from "#adapter/kinds.ts";
import type { Carried } from "#core/plan/carries.ts";

/** An artifact a registry serves, printed as its Markdown is written. */
interface ShownArtifact {
  name: string;
  kind: ArtifactKind;
  /** The version the registry serves. */
  version?: string;
  body: string;
  /** What a target that loads it starts on its own, such as hooks. */
  carries: Carried[];
}

/** A file or folder on disk, printed as its Markdown is written. */
interface ShownFile {
  /** The Markdown file read. */
  path: string;
  body: string;
  carries: Carried[];
}

/** `aireg show`: an artifact from a registry, or a file or folder named by path. */
export type ShowResult = ShownArtifact | ShownFile;
