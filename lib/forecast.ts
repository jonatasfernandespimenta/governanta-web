// Textos das previsões. Sempre como faixa e com incerteza (Princípio 5): nunca uma data certa.

import type { ForecastItem } from "./api";
import { capitalize, daysUntil, parseIso, relativeDay, weekdayPlain, WEEKDAYS } from "./format";

/** Horizonte das barras de previsão (o eixo vai de hoje a +12 dias). */
export const HORIZON_DAYS = 12;

export type Window = { min: number; max: number };

export function windowDays(f: ForecastItem): Window | null {
  const a = f.windowStart ?? f.expectedDepletionAt;
  const b = f.windowEnd ?? f.expectedDepletionAt;
  if (!a || !b) return null;
  const min = Math.max(0, daysUntil(a));
  return { min, max: Math.max(min, daysUntil(b)) };
}

/** Vai para "Ainda aprendendo" em vez da lista de previsões. */
export function isLearning(f: ForecastItem): boolean {
  return f.irregular || windowDays(f) == null;
}

export function learningReason(f: ForecastItem): string {
  if (f.irregular) return "Compras irregulares — ainda sem padrão.";
  if (f.nObservations <= 1) return "Só 1 compra registrada. Preciso de mais 1 ou 2 para estimar.";
  return "Ainda não tenho dados suficientes para estimar.";
}

/** "provavelmente acaba quinta", "provavelmente acaba hoje ou amanhã", "deve durar até a próxima semana". */
export function forecastPhrase(f: ForecastItem): string {
  const a = f.windowStart ?? f.expectedDepletionAt;
  const b = f.windowEnd ?? f.expectedDepletionAt;
  if (!a || !b) return "ainda sem estimativa";
  if (daysUntil(b) < 0) return "pode já ter acabado";
  const start = daysUntil(a) <= 0 ? "hoje" : relativeDay(a);
  const end = relativeDay(b);
  let phrase: string;
  if (daysUntil(a) >= 7) phrase = "deve durar até a próxima semana";
  else if (start === end) phrase = `provavelmente acaba ${end}`;
  else if (daysUntil(b) - Math.max(0, daysUntil(a)) <= 2) phrase = `provavelmente acaba ${start} ou ${end}`;
  else phrase = `deve acabar entre ${start} e ${end}`;
  if (f.method === "diet") phrase = `${phrase} · pela dieta`;
  return f.confidence === "low" ? `${phrase} — pouca certeza` : phrase;
}

/** "0–1 dia", "3–5 dias", "~4 dias" */
export function estimateLabel(w: Window): string {
  if (w.min === w.max) return w.max === 1 ? "~1 dia" : `~${w.max} dias`;
  return `${w.min}–${w.max} ${w.max === 1 ? "dia" : "dias"}`;
}

/** "1 a 3 dias" (texto da tela do produto) */
export function estimateLong(w: Window): string {
  if (w.min === w.max) return w.max === 1 ? "cerca de 1 dia" : `cerca de ${w.max} dias`;
  return `${w.min} a ${w.max} dias`;
}

/** Rótulo do grupo na tela de previsões: "Hoje", "Amanhã", "Quinta", "Próx. semana". */
export function dayGroup(f: ForecastItem): string {
  const iso = f.expectedDepletionAt ?? f.windowStart;
  if (!iso) return "";
  const n = daysUntil(iso);
  if (n <= 0) return "Hoje";
  if (n === 1) return "Amanhã";
  if (n < 7) return capitalize(weekdayPlain(parseIso(iso).getDay()));
  if (n < 14) return "Próx. semana";
  return "Mais adiante";
}

/** Dia mais provável por extenso ("quinta-feira", "hoje"). */
export function likelyDay(f: ForecastItem): string {
  const iso = f.expectedDepletionAt ?? f.windowEnd ?? f.windowStart;
  if (!iso) return "—";
  const n = daysUntil(iso);
  if (n <= 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n < 7) return WEEKDAYS[parseIso(iso).getDay()];
  return "na próxima semana";
}

/** "entre quarta e sexta" */
export function betweenDays(f: ForecastItem): string | null {
  if (!f.windowStart || !f.windowEnd) return null;
  const a = daysUntil(f.windowStart) <= 0 ? "hoje" : relativeDay(f.windowStart);
  const b = relativeDay(f.windowEnd);
  return a === b ? null : `entre ${a} e ${b}`;
}

/** Posição (em %) de um dia no eixo hoje → +12 dias. */
export function axisPct(days: number): number {
  return Math.min(100, Math.max(0, (days / HORIZON_DAYS) * 100));
}

export function band(w: Window): { left: string; width: string } {
  const left = axisPct(w.min);
  return { left: `${left}%`, width: `${Math.max(3, Math.min(100 - left, axisPct(w.max) - left))}%` };
}
