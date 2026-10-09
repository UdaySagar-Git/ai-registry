/** `preResolve` must not write: the plan is still pure at that point. */
const HOOK_STAGES = [
  "preConnect",
  "postConnect",
  "preResolve",
  "postResolve",
  "prePlan",
  "postPlan",
  "preApply",
  "postApply",
  "prePublish",
  "postPublish",
  "preClose",
  "postClose",
] as const;

export type HookStage = (typeof HOOK_STAGES)[number];

export function isHookStage(value: string): value is HookStage {
  return (HOOK_STAGES as readonly string[]).includes(value);
}

export interface PipelineHook {
  id: string;
  stage: HookStage;
  /** Module path, relative to `~/.aireg` or absolute under it. */
  handler: string;
  /** Registry alias; omit to run for every source. */
  matcher?: string | undefined;
}

export interface HookEvent {
  stage: HookStage;
  alias?: string | undefined;
  /** Plan/apply name every registry in the run, so a matcher can still fire. */
  aliases?: readonly string[] | undefined;
  [key: string]: unknown;
}
