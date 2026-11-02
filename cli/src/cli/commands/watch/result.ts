import type { Scope } from "#core/store/paths.ts";

/** One folder a job publishes as it changes. */
interface Watch {
  folder: string;
  /** Where it publishes, as `<registry>/<namespace>`. */
  to: string;
  jobId: string;
  scope: Scope;
  /** That scope's folder: the project's, or your user scope's. */
  root: string;
}

/** `aireg watch list`. */
export interface WatchList {
  watches: Watch[];
}

/** `aireg watch remove`, once per job it changed: the folders that job still watches. */
export interface WatchRemoved {
  jobId: string;
  watching: string[];
}
