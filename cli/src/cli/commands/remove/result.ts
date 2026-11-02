/** `aireg remove`: what left the scope, and what stayed for a reason. */
export interface RemoveResult {
  dryRun: boolean;
  /** Named and removed; one another artifact still needs stays installed, and is not here. */
  removed: string[];
  /** Dependencies removed with them. */
  pruned: string[];
  /** Kept because a job publishes them from the person's own folders. */
  watched: string[];
}
