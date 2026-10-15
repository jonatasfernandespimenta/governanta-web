"use client";

import { useSyncExternalStore } from "react";

// Relógio compartilhado (um timer só para a tela toda). No servidor/pré-renderização devolve null,
// então nada que dependa da hora é desenhado antes de o app abrir no aparelho.

const TICK_MS = 15_000;
let now = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const subs = new Set<() => void>();

function subscribe(cb: () => void) {
  subs.add(cb);
  if (subs.size === 1) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      subs.forEach((f) => f());
    }, TICK_MS);
  }
  return () => {
    subs.delete(cb);
    if (!subs.size) clearInterval(timer);
  };
}

export function useNow(): Date | null {
  const t = useSyncExternalStore(
    subscribe,
    () => now,
    () => 0,
  );
  return t ? new Date(t) : null;
}
