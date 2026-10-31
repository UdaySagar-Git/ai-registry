import type { AutostartState } from "#daemon/autostart/model.ts";
import type { DaemonProbe } from "#daemon/process/lifecycle.ts";

type DaemonState = DaemonProbe["status"];

/** `aireg daemon status`; `pid` is absent when no daemon wrote one. */
export interface DaemonStatus {
  status: DaemonState;
  pid?: number;
  jobs: number;
  enabled: number;
  paused: boolean;
  autostart: boolean;
}

/** `aireg daemon start`, `stop` and `restart`: what they leave running, and whether they acted. */
export interface DaemonSettled {
  status: DaemonState;
  pid?: number;
  changed: boolean;
}

/** `aireg daemon autostart on` and `off`. */
interface AutostartSwitched extends AutostartState {
  changed: boolean;
}

interface AutostartSupported extends AutostartState {
  supported: true;
}

/** `aireg daemon autostart`: a switch's outcome, or with `status` how it stands. */
export type DaemonAutostart = AutostartSwitched | { supported: false } | AutostartSupported;
