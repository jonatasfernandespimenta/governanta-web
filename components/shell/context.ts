"use client";

import { createContext, useContext } from "react";
import type { Household } from "@/lib/api";

export type SheetKind = "add" | "acabou" | "usei";

export type ToastOpts = {
  /** Desfaz uma ação já gravada (ex.: apaga o item recém-criado). */
  undo?: () => Promise<unknown>;
  /** Grava só quando o aviso some sem Desfazer (ações que a API não sabe reverter). */
  commit?: () => Promise<unknown>;
};

export type Kiosk = {
  openSheet: (kind: SheetKind, query?: string) => void;
  toast: (text: string, opts?: ToastOpts) => void;
  startVoice: () => void;
  /** Roda uma escrita; se a rede/servidor falhar, guarda para tentar de novo e abre o diálogo. */
  write: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
  household: Household | undefined;
  reloadHousehold: () => void;
  offline: boolean;
};

export const KioskContext = createContext<Kiosk | null>(null);

export function useKiosk(): Kiosk {
  const k = useContext(KioskContext);
  if (!k) throw new Error("useKiosk fora do KioskProvider");
  return k;
}
