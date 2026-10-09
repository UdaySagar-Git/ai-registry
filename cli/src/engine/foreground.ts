import type { SyncPolicy } from "#core/sync/policy.ts";

/**
 * `publish: report` is the invariant, not a default: taking what someone else
 * published is recoverable, sending your half-finished work upstream is not.
 */
export const FOREGROUND_POLICY: SyncPolicy = {
  pull: "on",
  publish: "report",
  delete: "report",
};
