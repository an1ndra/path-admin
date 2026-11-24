import { useCallback, useEffect, useState } from "react";
import { Unauthorized } from "./api";
import { useAuth } from "./auth";
import { cacheGet, cacheSet } from "./cache";

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Runs a loader on mount and exposes a reload for after a mutation.
 *
 * Pass a stable `key` to cache the result. A page mounted for the first time
 * shows its skeleton; mounting it again starts from the cached value and
 * refreshes in the background, so navigation does not blank the panel.
 */
export function useAsync<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
  key?: string,
) {
  const { signOut } = useAuth();
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<State<T>>(() => {
    const cached = key ? cacheGet<T>(key) : undefined;
    return cached !== undefined
      ? { data: cached, error: null, loading: true }
      : { data: null, error: null, loading: true };
  });

  useEffect(() => {
    let cancelled = false;
    const cached = key ? cacheGet<T>(key) : undefined;
    setState((prev) => {
      if (cached !== undefined) return { data: cached, error: null, loading: true };
      if (key !== undefined && prev.data !== null) {
        return { data: null, error: null, loading: true };
      }
      return { ...prev, loading: true, error: null };
    });
    load()
      .then((data) => {
        if (cancelled) return;
        if (key) cacheSet(key, data);
        setState({ data, error: null, loading: false });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof Unauthorized) {
          signOut();
          return;
        }
        setState((prev) => ({
          data: prev.data,
          error: e instanceof Error ? e.message : String(e),
          loading: false,
        }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, key]);

  const reload = useCallback(async () => {
    setNonce((n) => n + 1);
  }, []);

  return { ...state, reload };
}
