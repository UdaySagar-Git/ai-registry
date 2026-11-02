import type { Job } from "#core/config/model.ts";
import type { RunEvent, RunRecord } from "#core/run/model.ts";

/** `aireg job add`: the job as saved, and the config revision that holds it. */
export interface JobSaved {
  job: Job;
  revision: number;
}

/** `aireg job list`. */
export interface JobList {
  paused: boolean;
  jobs: readonly Job[];
}

/** `aireg job remove`. */
export interface JobRemoved {
  jobId: string;
}

/** `aireg job enable` and `disable`: the schedule as it now stands. */
export interface JobToggled {
  jobId: string;
  enabled: boolean;
}

/** `aireg job pause` and `resume`. */
export interface JobsPaused {
  paused: boolean;
  revision: number;
}

/** `aireg job start`, `retry` and `cancel`: the run as the daemon answered. */
export interface JobRun {
  run: RunRecord;
}

/** `aireg job runs`: recent runs, newest first. */
export interface RunList {
  runs: RunRecord[];
}

/** `aireg job runs <run>`: the run, and every event it recorded. */
export interface RunDetail {
  run: RunRecord;
  events: RunEvent[];
}
