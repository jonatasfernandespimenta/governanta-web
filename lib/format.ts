// Textos de data, dinheiro e quantidade em pt-BR. Datas YYYY-MM-DD são lidas sem passar por fuso.

export const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
export const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "quinta-feira" → "quinta" */
export const weekdayPlain = (i: number) => WEEKDAYS[i].replace("-feira", "");

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Dias inteiros entre hoje (local) e uma data YYYY-MM-DD. Negativo = passado. */
export function daysUntil(iso: string, now = new Date()): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000);
}

/** Data local de um instante ISO, como YYYY-MM-DD. */
export function localIso(instant: string | Date): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Terça-feira, 22 de setembro" */
export function longDate(d: Date): string {
  return `${capitalize(WEEKDAYS[d.getDay()])}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

/** "12 set" */
export function dayMonth(iso: string): string {
  const d = parseIso(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "08:14" */
export function clock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Dia relativo curto: "hoje", "amanhã", "quinta" (até 6 dias), "próxima semana", "12 set". */
export function relativeDay(iso: string): string {
  const n = daysUntil(iso);
  if (n === 0) return "hoje";
  if (n === 1) return "amanhã";
  if (n === -1) return "ontem";
  if (n > 1 && n < 7) return weekdayPlain(parseIso(iso).getDay());
  if (n >= 7 && n < 14) return "a próxima semana";
  return dayMonth(iso);
}

/** "há 5 min", "ontem", "sáb" — para marcações na lista e uso recente. */
export function agoLabel(instant: string, now = new Date()): string {
  const mins = Math.round((now.getTime() - new Date(instant).getTime()) / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const n = -daysUntil(localIso(instant), now);
  if (n === 0) return `há ${Math.round(mins / 60)} h`;
  if (n === 1) return "ontem";
  if (n < 7) return WEEKDAYS_SHORT[new Date(instant).getDay()];
  return dayMonth(localIso(instant));
}

// ---------- Dinheiro ----------

const brl = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** 142680 → "R$ 1.426,80" */
export const money = (cents: number) => `R$ ${brl.format(cents / 100)}`;
/** 142680 → "R$ 1.427" (resumos) */
export const moneyRound = (cents: number) => `R$ ${brl0.format(Math.round(cents / 100))}`;
/** 849 → "8,49" (rótulo de barra) */
export const moneyBare = (cents: number) => brl.format(cents / 100);

export function percent(p: number): string {
  return `${p.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

// ---------- Quantidade ----------

const UNIT_LABEL: Record<string, string> = { un: "un.", pct: "pct", g: "g", kg: "kg", ml: "ml", l: "L" };

/** 1 + "dz" → "1 dúzia"; 1.215 + "kg" → "1,215 kg"; null → "" */
export function qtyLabel(q: number | null | undefined, unit: string | null | undefined): string {
  if (q == null) return "";
  const n = q.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  if (unit === "dz") return q === 1 ? "1 dúzia" : `${n} dúzias`;
  return `${n} ${UNIT_LABEL[unit ?? "un"] ?? unit}`;
}

/** Passo do +/− na lista: 1 para unidades, 0,5 para kg/L, 100 para g/ml. */
export function qtyStep(unit: string | null | undefined): number {
  if (unit === "g" || unit === "ml") return 100;
  if (unit === "kg" || unit === "l") return 0.5;
  return 1;
}

/** Fração de uma embalagem em texto: 0,25 → "¼". */
export function fractionGlyph(f: number): string {
  const q = Math.round(f * 4) / 4;
  if (q <= 0) return "quase nada";
  return ({ 0.25: "¼", 0.5: "½", 0.75: "¾", 1: "1" } as Record<number, string>)[q] ?? q.toLocaleString("pt-BR");
}

/** O que resta em casa: fração da embalagem aberta + embalagens fechadas. */
export function stockLeft(remainingFraction: number | null, packages: number): string | null {
  if (remainingFraction == null) return null;
  const extra = Math.max(0, packages - 1);
  if (remainingFraction <= 0.05) return extra ? `~${extra} ${extra === 1 ? "embalagem fechada" : "embalagens fechadas"}` : "quase nada";
  const open = fractionGlyph(remainingFraction);
  if (open === "quase nada") return extra ? `quase nada + ${extra} ${extra === 1 ? "embalagem fechada" : "embalagens fechadas"}` : "quase nada";
  if (extra === 0) return open === "1" ? "~1 embalagem" : `~${open} embalagem`;
  return `~${open === "1" ? 1 + extra : `${extra} e ${open}`} embalagens`;
}

/** Normaliza para comparar nomes ("Leite Condensado" ≈ "leite condensado"). */
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

// ---------- Dieta ----------

const n1 = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const n0 = (n: number) => Math.round(n).toLocaleString("pt-BR");

/** Quantidade da dieta: 424,3 g → "424 g"; 4242,9 g → "4,2 kg"; 2,893 un → "2,9"; 6750 ui → "6.750 UI". */
export function dietAmount(n: number, unit: string): string {
  if (unit === "g") return n >= 1000 ? `${n1(n / 1000)} kg` : `${n0(n)} g`;
  if (unit === "ml") return n >= 1000 ? `${n1(n / 1000)} L` : `${n0(n)} ml`;
  if (unit === "mg") return n >= 1000 ? `${n1(n / 1000)} g` : `${n0(n)} mg`;
  if (unit === "ui") return `${n0(n)} UI`;
  return n1(n);
}
