/** One adapter installed from the release server, by the module path aireg loads. */
interface InstalledAdapter {
  id: string;
  specifier: string;
}

/** `aireg adapter list`. */
export interface AdapterList {
  adapters: InstalledAdapter[];
}

/** `aireg adapter install`: what it did, or with `--dry-run` would do. */
export interface AdapterInstall {
  dryRun: boolean;
  action: "already-installed" | "would-install" | "installed";
  id: string;
  version: string;
  specifier: string;
}

/** `aireg adapter remove`. */
export interface AdapterRemove {
  dryRun: boolean;
  action: "would-remove" | "removed";
  id: string;
  specifier: string;
}

/** `aireg adapter init`: the package's folder, and the files it wrote or would write. */
export interface AdapterInit {
  id: string;
  dir: string;
  files: string[];
  dryRun: boolean;
}
