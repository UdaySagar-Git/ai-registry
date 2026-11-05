/** What `aireg self update` did, or with `--check` or `--dry-run` would do. */
type UpdateAction =
  | "already-latest"
  | "update-available"
  | "would-update"
  | "updated"
  | "would-rollback"
  | "rolled-back";

/** `aireg self update`: after an update, `current` is the version now installed. */
export interface SelfUpdate {
  current: string;
  latest: string;
  action: UpdateAction;
  /** Only after an update: the executable PATH finds. */
  bin?: string;
  dryRun: boolean;
}

/** `aireg self uninstall`: what it removed, or with `--dry-run` would remove. */
export interface SelfUninstall {
  action: "would-uninstall" | "uninstalled";
  dryRun: boolean;
  daemon: boolean;
  autostart: boolean;
  links: string[];
  startupFiles: string[];
  folders: string[];
  /** Left in place: a CLI aireg did not install, or a folder that holds your home. */
  kept: string[];
}
