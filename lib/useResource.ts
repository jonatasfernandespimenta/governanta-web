"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeRetry } from "./api";

type State<T> = { data: T | undefined; error: Error | null; loading: boolean };

/**
 * Carrega um recurso da API no cliente e o mantém atualizado:
 * recarrega ao voltar o foco, a cada `pollMs` (quiosque fica aberto o dia todo)
 * e quando o banner de conexão pede "Tentar de novo".
 */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, pollMs = 30_000) {
  const [state, setState] = useState<State<T>>({ data: undefined, error: null, loading: true });
  const loadRef = useRef(load);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadRef.current = load;
  });

  const reload = useCallback(async () => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      const data = await loadRef.current(ctrl.signal);
      if (!ctrl.signal.aborted) setState({ data, error: null, loading: false });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setState((s) => ({ ...s, error: err as Error, loading: false }));
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(reload, 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, pollMs);
    const onFocus = () => reload();
    window.addEventListener("focus", onFocus);
    const unsubscribe = subscribeRetry(reload);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      unsubscribe();
      ctrlRef.current?.abort();
    };
  }, [reload, pollMs]);

  const mutate = useCallback((fn: (prev: T | undefined) => T | undefined) => {
    setState((s) => ({ ...s, data: fn(s.data) }));
  }, []);

  return { ...state, reload, mutate };
}
