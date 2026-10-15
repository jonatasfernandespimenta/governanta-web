// Regras e textos da dieta que mais de uma tela usa (plano, revisão, diário).

import type { DietLink, DietOption, DietPlan, DietShopping, DietSlot, DietUnit, QtyUnit } from "./api";
import { capitalize, dietAmount, localIso, WEEKDAYS_SHORT } from "./format";

/** O slot entra na conta: não é "à vontade" e, se opcional, foi incluído. */
export function slotCounts(s: DietSlot): boolean {
  return !s.adLibitum && (!s.optional || s.includeOptional);
}

/** Opções que valem hoje (peso efetivo > 0); num slot que não conta, a primeira. */
export function chosenOptions(s: DietSlot): DietOption[] {
  const on = s.options.filter((o) => o.effectiveWeight > 0);
  return on.length ? on : s.options.slice(0, 1);
}

/** "seg a sex", "todos os dias", "seg, qua, sex" */
export function weekdaysLabel(days: number[]): string {
  const d = [...days].sort((a, b) => a - b);
  if (d.length === 7) return "todos os dias";
  if (d.join() === "1,2,3,4,5") return "seg a sex";
  if (d.join() === "0,6") return "fins de semana";
  return d.map((i) => WEEKDAYS_SHORT[i]).join(", ");
}

/** Dia da semana de hoje é dia de dieta. */
export function isDietDay(plan: DietPlan, now = new Date()): boolean {
  return plan.dietWeekdays.includes(now.getDay());
}

export function todayException(plan: DietPlan, now = new Date()) {
  const today = localIso(now);
  return plan.exceptions.find((e) => e.date === today) ?? null;
}

/** Rótulo do tamanho de uma unidade para itens contados ("g por fatia", "mg por cápsula"). Null = não se aplica. */
export function perUnitLabel(link: DietLink): string | null {
  if (link.units.includes("mg")) return "mg por cápsula";
  if (link.units.includes("ui")) return "UI por cápsula";
  if (link.units.includes("un")) return /fatia/.test(link.rawName) ? "g por fatia" : "g por unidade";
  return null;
}

/** Item da lista de compras para "Pôr na lista": embalagens quando o tamanho é conhecido, senão a medida. */
export function listQuantity(it: DietShopping["items"][number]): { quantity: number | null; unit: QtyUnit | null } {
  if (it.toBuy <= 0) return { quantity: null, unit: null };
  if (it.unit === "un") return { quantity: Math.ceil(it.toBuy), unit: "un" };
  if (it.packagesToBuy) return { quantity: it.packagesToBuy, unit: "un" };
  if (it.unit === "g") return it.toBuy >= 1000 ? { quantity: Math.ceil(it.toBuy / 100) / 10, unit: "kg" } : { quantity: Math.ceil(it.toBuy / 10) * 10, unit: "g" };
  if (it.unit === "ml") return it.toBuy >= 1000 ? { quantity: Math.ceil(it.toBuy / 100) / 10, unit: "l" } : { quantity: Math.ceil(it.toBuy / 10) * 10, unit: "ml" };
  return { quantity: null, unit: null };
}

/** "4,3 kg" · "2 × 13 unidades" · "16" — o que comprar, em texto. */
export function toBuyLabel(it: DietShopping["items"][number]): string {
  if (it.packagesToBuy && it.packageLabel) return `${it.packagesToBuy} × ${it.packageLabel}`;
  return it.unit === "un" ? `${Math.ceil(it.toBuy)} un.` : dietAmount(it.toBuy, it.unit);
}

/** "Frango 424 g" para a lista "Por dia". */
export function perDayLabel(name: string, perDay: number, unit: DietUnit): string {
  return `${capitalize(name)} ${dietAmount(perDay, unit)}`;
}

/** Quantidade de um item no formato da nutricionista ("170 g", "3", "7.000 UI"). */
export function itemAmount(quantity: number | null, unit: DietUnit | null): string {
  if (quantity == null || !unit) return "";
  if (unit === "un") return quantity.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (unit === "ui") return `${quantity.toLocaleString("pt-BR")} UI`;
  return `${quantity.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${unit}`;
}
