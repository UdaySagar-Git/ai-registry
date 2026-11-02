import type { ArtifactKind } from "#adapter/kinds.ts";
import type { LayoutId } from "#adapter/layouts/ids.ts";
import type { Scope } from "#core/store/paths.ts";

/** A declared registry, in the words every command uses. */
export interface DeclaredRegistry {
  registry: string;
  /** Without credentials. */
  address: string;
  /** Absent when aireg asks each adapter whether it recognizes the address. */
  adapter?: string;
  config: Record<string, string>;
}

/** `aireg registry add`. `movedFrom` and `kept` are there only when the name moved. */
export interface RegistryAdded extends DeclaredRegistry {
  movedFrom?: string;
  kept?: number;
  /** False when the registry could not be read before you sign in. */
  readable: boolean;
  dryRun: boolean;
}

/** `aireg registry list`. */
export interface RegistryList {
  scope: Scope;
  registries: DeclaredRegistry[];
}

/** One artifact `aireg registry show` lists. */
export interface PublishedArtifact {
  name: string;
  kind: ArtifactKind;
  namespace?: string;
  path: string;
  description?: string;
  /** The oldest aireg that can install it. */
  engine?: string;
  /** The version the registry serves, which `@<version>` pins. */
  version?: string;
}

/** `aireg registry show`. */
export interface RegistryShown {
  registry: string;
  address: string;
  /** The commit read, for a git registry. */
  revision?: string;
  /** Only for a source that is not a registry. */
  layout?: LayoutId;
  layouts: string[];
  entries: PublishedArtifact[];
  warnings: string[];
}

/** `aireg registry remove`. */
export interface RegistryRemoved {
  registry: string;
  dryRun: boolean;
  /** The ids of the jobs removed with it, or that would be. */
  jobs: string[];
}

/** `aireg registry init`. In a registry already, `namespaces` holds only the ones it added. */
export interface RegistryCreated {
  root: string;
  created: boolean;
  slug: string;
  namespaces: string[];
}

/** One version `aireg registry index` indexed, or whose artifact's `latest` it moved. */
export interface IndexedVersion {
  namespace: string;
  kind: ArtifactKind;
  name: string;
  version: string;
  digest: string;
  description?: string;
  status?: string;
  catalogDigest?: string;
}

/** `aireg registry index`. */
export interface RegistryIndexed {
  root: string;
  added: IndexedVersion[];
  moved: IndexedVersion[];
  /** Root-relative paths written. */
  paths: string[];
}

/** One problem `aireg registry validate` found. */
export interface RegistryProblem {
  path: string;
  message: string;
  fix?: string;
}

/** `aireg registry validate`. */
export interface RegistryValidated {
  name: string;
  namespaces: number;
  artifacts: number;
  versions: number;
  problems: RegistryProblem[];
  warnings: string[];
}
