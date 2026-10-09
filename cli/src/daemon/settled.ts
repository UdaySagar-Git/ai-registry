/**
 * Waits for the work to settle, or for the grace period, whichever is first.
 * What is still running after it is left to finish, or never, on its own.
 */
export async function settledWithin(work: Iterable<Promise<unknown>>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    Promise.allSettled(work),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
      timer.unref();
    }),
  ]);
  clearTimeout(timer);
}
