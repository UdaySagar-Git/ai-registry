import type { Step } from "#cli/onboarding/flow.ts";

interface Written {
  manifest: string;
  scope: "project";
  targets: string[];
  imported: number;
}

/** `aireg init`: what it wrote, and the commands to run next. */
export interface InitNext extends Written {
  next: string[];
}

/** `aireg init --registry`: what it wrote, and each step it took in place of `next`. */
export interface InitSteps extends Written {
  steps: Step[];
}

export type InitResult = InitNext | InitSteps;
