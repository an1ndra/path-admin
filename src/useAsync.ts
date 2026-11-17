import { useCallback, useEffect, useState } from "react";
import { Unauthorized } from "./api";
import { useAuth } from "./auth";

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/** Runs a loader on mount and exposes a reload for after a mutation. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const { signOut } = useAuth();
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    load()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof Unauthorized) {
          signOut();
          return;
        }
        setState({ data: null, error: e instanceof Error ? e.message : String(e), loading: false });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(async () => {
    setNonce((n) => n + 1);
  }, []);

  return { ...state, reload };
}
