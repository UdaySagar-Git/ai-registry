import { setTimeout as sleep } from "node:timers/promises";

/** Checks `done` every `everyMs` until it holds or `timeoutMs` passes; false when it never held. */
export async function pollUntil(
  done: () => boolean | Promise<boolean>,
  timeoutMs: number,
  everyMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await done()) return true;
    await sleep(everyMs);
  }
  return false;
}
