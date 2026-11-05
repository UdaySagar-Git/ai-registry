import { useEffect, useState } from "react";

/** The time the console draws with, so "edited 4m ago" stays true while it is open. */
export function useClock(running: boolean): number {
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), running ? 1_000 : 30_000);
    return () => clearInterval(timer);
  }, [running]);
  return nowMs;
}
