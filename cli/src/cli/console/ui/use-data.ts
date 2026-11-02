import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { collect } from "#cli/console/data/state.ts";
import type { ConsoleState } from "#core/console/model.ts";
import type { HostCommandContext } from "#core/host/extend.ts";

export interface ConsoleData {
  state: ConsoleState;
  /** The newest read, for a command started from a callback an older render made. */
  latest: RefObject<ConsoleState>;
  busy: boolean;
  /** Reads the selected registry again, or `accountId`'s. */
  reload(accountId?: string): Promise<ConsoleState>;
  selectAccount(id: string): void;
}

export function useConsoleData(context: HostCommandContext, initial: ConsoleState): ConsoleData {
  const [state, setState] = useState<ConsoleState>(initial);
  const latest = useRef(state);
  latest.current = state;
  const account = useRef<string | undefined>(initial.account?.id);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(
    async (accountId?: string): Promise<ConsoleState> => {
      setBusy(true);
      try {
        // Read through the ref: a command that finishes after an account
        // switch must not reload the account it started under.
        const next = await collect(context, { accountId: accountId ?? account.current });
        setState(next);
        return next;
      } finally {
        setBusy(false);
      }
    },
    [context],
  );

  const selectAccount = useCallback(
    (id: string) => {
      account.current = id;
      void reload(id);
    },
    [reload],
  );

  return { state, latest, busy, reload, selectAccount };
}

/**
 * Asks the selected panel to read what it is about to show, every render: the panel knows
 * what it has read, and false is cheap.
 */
export function usePanelPrefetch(prefetch: (() => Promise<boolean>) | undefined): void {
  // A panel's lazy read is not state the render holds; this is what redraws.
  const [, setPrefetched] = useState(0);
  useEffect(() => {
    if (prefetch === undefined) return;
    void prefetch().then((changed) => {
      if (changed) setPrefetched((count) => count + 1);
    });
  }, [prefetch]);
}
