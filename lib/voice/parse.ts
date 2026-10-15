// Parser determinístico de comandos de voz PT-BR (gramática v1, evolução do EXP-003 / EXP-001).
// Sem dependências em runtime: roda no browser e no Node (`node --test`, type stripping).
//
// Estratégia: normaliza (minúsculas, sem pontuação, números/frações), quebra em tokens e guarda
// duas versões de cada token: `o` (com acento, para o produto sair legível) e `f` (sem acento,
// para casar a gramática). Tudo é casado em `f`; o nome do produto é montado com `o`.

import type { VoiceIntent } from "./types";

export const GRAMMAR_VERSION = "v1";

type Tok = { o: string; f: string };
type Kind = "depleted" | "add_to_list" | "remove_from_list" | "used";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// ---------- vocabulário (sempre sem acento) ----------

const VERBS: [Kind, string[]][] = [
  ["depleted", ["nao tem mais", "nao temos mais", "nao ha mais", "acabou", "acabaram", "terminou", "terminaram", "cabou", "acabo"]],
  [
    "add_to_list",
    [
      "precisa comprar", "preciso comprar", "tem que comprar",
      "coloca", "coloque", "colocar", "poe", "ponha", "por", "bota", "bote", "botar",
      "adiciona", "adicione", "adicionar", "acrescenta", "acrescente", "inclui", "inclua", "incluir",
      "anota", "anote", "compra", "comprar",
    ],
  ],
  ["remove_from_list", ["tira", "tire", "tirar", "remove", "remova", "remover", "apaga", "apague", "exclui", "exclua", "risca", "risque"]],
  ["used", ["usei", "usamos", "usou", "gastei", "gastamos", "comi", "comemos", "bebi", "bebemos", "consumi", "consumimos"]],
];
// Verbos de várias palavras primeiro.
const VERB_SEQS = VERBS.flatMap(([kind, list]) => list.map((v) => ({ kind, seq: v.split(" ") }))).sort(
  (a, b) => b.seq.length - a.seq.length,
);

const POSTFIX_DEPLETED = new Set(["acabou", "acabaram", "terminou", "terminaram"]);

// "cancela", "não, cancela", "desfaz isso", "deixa pra lá"...
const CANCEL_CORE = new Set(["cancela", "cancelar", "cancele", "nao", "desfaz", "desfazer", "desfaca", "esquece", "deixa"]);
const CANCEL_OK = new Set([...CANCEL_CORE, "isso", "tudo", "e", "pra", "para", "la", "quero", "ai", "a"]);

const LEADING_FILLERS = new Set(["ok", "oi", "ei", "ah", "e", "hum", "entao", "olha", "governanta", "ai"]);
const DETERMINERS = new Set([
  "o", "a", "os", "as", "um", "uma", "uns", "umas", "meu", "minha", "meus", "minhas", "nosso", "nossa",
  "esse", "essa", "esses", "essas", "aquele", "aquela", "todo", "toda", "todos", "todas",
]);
const DE = new Set(["de", "do", "da", "dos", "das"]);
const TRAILING_NOISE = new Set(["tambem", "ja", "aqui", "ai", "agora", "hoje", "isso"]);
const LIST_PREP = new Set(["na", "a", "pra", "para", "em", "no", "minha", "nossa", "da", "de", "dessa", "desta"]);

const NUMBERS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16,
  dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50,
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300,
  quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500, mil: 1000,
  meio: 0.5, meia: 0.5,
};

const UNITS: Record<string, string> = {
  kg: "kg", k: "kg", quilo: "kg", quilos: "kg", kilo: "kg", kilos: "kg", quilograma: "kg", quilogramas: "kg",
  g: "g", gr: "g", grama: "g", gramas: "g",
  l: "l", lt: "l", litro: "l", litros: "l",
  ml: "ml", mililitro: "ml", mililitros: "ml",
  pacote: "pct", pacotes: "pct", pct: "pct", pacotinho: "pct", pacotinhos: "pct",
  duzia: "dz", duzias: "dz", dz: "dz",
  unidade: "un", unidades: "un", un: "un",
  caixa: "un", caixas: "un", lata: "un", latas: "un", garrafa: "un", garrafas: "un",
  pote: "un", potes: "un", vidro: "un", vidros: "un", saco: "un", sacos: "un",
};

// Frações de embalagem para "usei": [sequência sem acento, fração]
const FRACTIONS: [string[], number][] = [
  [["tres", "quartos"], 0.75],
  [["dois", "tercos"], 2 / 3],
  [["um", "terco"], 1 / 3],
  [["um", "quarto"], 0.25],
  [["1", "quarto"], 0.25],
  [["0_25"], 0.25],
  [["0_5"], 0.5],
  [["0_75"], 0.75],
  [["a", "metade"], 0.5],
  [["metade"], 0.5],
  [["meio"], 0.5],
  [["meia"], 0.5],
  [["tudo"], 1],
  [["todo"], 1],
  [["toda"], 1],
];
const CONTAINERS = new Set(["pote", "pacote", "caixa", "lata", "garrafa", "vidro", "saco", "embalagem", "vidrinho"]);

// ---------- normalização ----------

/** Remove alucinações típicas do Whisper em silêncio/ruído e marcações como "[Música]". */
export function cleanTranscript(text: string): string {
  const s = String(text ?? "")
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, " ")
    .replace(/amara\.org/gi, " ")
    .replace(/legendas? (pela|por) comunidade[^.]*\.?/gi, " ")
    .replace(/inscreva-se[^.]*\.?/gi, " ")
    .replace(/obrigad[oa] por assistir[^.]*\.?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^(obrigad[oa]|tchau|valeu|\.+|-+)[.!]?$/i.test(s) ? "" : s;
}

const FRACTION_WORDS: Record<string, string> = { "1/2": "meio", "1/4": "um quarto", "3/4": "tres quartos", "1/3": "um terco", "2/3": "dois tercos" };

/** Texto → tokens normalizados (minúsculas, sem pontuação; vírgulas viram "e"; decimais como "1_5"). */
function tokenize(text: string): Tok[] {
  const s = String(text ?? "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/¼/g, " um quarto ")
    .replace(/½/g, " meio ")
    .replace(/¾/g, " tres quartos ")
    .replace(/(\d)\s*\/\s*(\d)/g, (m, a: string, b: string) => ` ${FRACTION_WORDS[`${a}/${b}`] ?? String(Number(a) / Number(b)).replace(".", "_")} `)
    .replace(/(\d)[.,](\d)/g, "$1_$2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/\bpor favor\b|\bpfv\b|\bobrigad[oa]\b|\bvaleu\b/g, " ")
    .replace(/,|;/g, " e ")
    .replace(/[^0-9a-zà-öø-ÿ_\s]/g, " ")
    .trim();
  if (!s) return [];
  const toks: Tok[] = [];
  for (const o of s.split(/\s+/)) {
    const f = fold(o).replace(/ç/g, "c");
    // Whisper: "na lista" sai "analista"/"enalista"/"nalista" (EXP-001).
    if (/^(a|e|i)?n+a+lista$/.test(f)) toks.push({ o: "na", f: "na" }, { o: "lista", f: "lista" });
    else if (f === "dalista") toks.push({ o: "da", f: "da" }, { o: "lista", f: "lista" });
    else if (f === "alista") toks.push({ o: "a", f: "a" }, { o: "lista", f: "lista" });
    else toks.push({ o, f });
  }
  return toks;
}

/** Forma normalizada (sem acento) usada para comparações; exportada para testes e para o resolveProduct. */
export function normalize(text: string): string {
  return tokenize(text)
    .map((t) => t.f)
    .join(" ");
}

// ---------- gramática ----------

function verbAt(toks: Tok[], i: number): { kind: Kind; len: number } | null {
  for (const { kind, seq } of VERB_SEQS) {
    if (seq.every((w, k) => toks[i + k]?.f === w)) return { kind, len: seq.length };
  }
  return null;
}

function parseNumber(f: string): number | null {
  if (/^\d+(_\d+)?$/.test(f)) return Number(f.replace("_", "."));
  return f in NUMBERS ? NUMBERS[f] : null;
}

/** Remove "na lista", "da lista de compras", etc. do fim (e do começo) da cláusula. */
function stripListPhrase(toks: Tok[]): Tok[] {
  let t = toks;
  const lastIs = (...w: string[]) => w.length <= t.length && w.every((x, k) => t[t.length - w.length + k].f === x);
  if (lastIs("lista", "de", "compras") || lastIs("lista", "do", "mercado")) t = t.slice(0, -2);
  if (lastIs("lista")) {
    t = t.slice(0, -1);
    for (let n = 0; n < 3 && t.length && LIST_PREP.has(t[t.length - 1].f); n++) t = t.slice(0, -1);
  }
  // "coloca na lista o café"
  const li = t.findIndex((x) => x.f === "lista");
  if (li >= 0 && li <= 2 && t.slice(0, li).every((x) => LIST_PREP.has(x.f))) {
    t = t.slice(li + 1);
    if (t[0] && ["de", "do"].includes(t[0].f) && t[1]?.f === "compras") t = t.slice(2);
  }
  return t;
}

/** Quebra a lista de produtos em "e" (exceto "dois quilos e meio [de]"). */
function splitParts(toks: Tok[]): Tok[][] {
  const parts: Tok[][] = [[]];
  toks.forEach((t, i) => {
    const next = toks[i + 1]?.f;
    const half = (next === "meio" || next === "meia") && !(toks[i + 2] && UNITS[toks[i + 2].f]);
    if (t.f === "e" && !half) parts.push([]);
    else parts[parts.length - 1].push(t);
  });
  return parts.filter((p) => p.length);
}

function stripLeading(toks: Tok[], set: Set<string>): Tok[] {
  let i = 0;
  while (i < toks.length && set.has(toks[i].f)) i++;
  return toks.slice(i);
}

function productName(toks: Tok[]): string {
  let t = stripLeading(stripLeading(toks, DETERMINERS), DE);
  t = stripLeading(t, DETERMINERS);
  let end = t.length;
  while (end > 0 && TRAILING_NOISE.has(t[end - 1].f)) end--;
  if (t[end - 2]?.f === "de" && t[end - 1]?.f === "novo") end -= 2;
  return t
    .slice(0, end)
    .map((x) => x.o)
    .join(" ")
    .trim();
}

type Qty = { quantity?: number; unit?: string; rest: Tok[] };

/** "[N] [unidade] [de] X". `umIsNumber`: em "usei um ovo" o "um" conta; em "coloca um leite" é artigo. */
function parseQty(toks: Tok[], umIsNumber: boolean): Qty {
  const t = stripLeading(toks, new Set(["o", "a", "os", "as"]));
  if (t[0]?.f === "meia" && (t[1]?.f === "duzia" || t[1]?.f === "duzias")) {
    return { quantity: 6, unit: "un", rest: stripLeading(t.slice(2), DE) };
  }
  const n = t[0] ? parseNumber(t[0].f) : null;
  if (n === null) return { rest: t };
  let i = 1;
  let quantity = n;
  let unit: string | undefined;
  if (t[i] && UNITS[t[i].f]) {
    unit = UNITS[t[i].f];
    i++;
    if (t[i]?.f === "e" && (t[i + 1]?.f === "meio" || t[i + 1]?.f === "meia")) {
      quantity += 0.5;
      i += 2;
    }
  } else if (t[i]?.f === "e" && (t[i + 1]?.f === "meio" || t[i + 1]?.f === "meia") && t[i + 2] && UNITS[t[i + 2].f]) {
    // "um e meio quilo"
    quantity += 0.5;
    unit = UNITS[t[i + 2].f];
    i += 3;
  } else if ((t[0].f === "um" || t[0].f === "uma") && !umIsNumber) {
    return { rest: t }; // artigo
  } else if (n === 0.5) {
    return { rest: t }; // "meio" sem unidade não é quantidade
  }
  return { quantity, unit, rest: stripLeading(t.slice(i), DE) };
}

function parseFraction(toks: Tok[]): { fraction: number; rest: Tok[] } | null {
  for (const [seq, fraction] of FRACTIONS) {
    if (seq.every((w, k) => toks[k]?.f === w)) {
      // "meio quilo" é quantidade, não fração da embalagem
      if (toks[seq.length] && UNITS[toks[seq.length].f] && !CONTAINERS.has(toks[seq.length].f)) return null;
      let rest = stripLeading(toks.slice(seq.length), DE);
      if (rest[0] && CONTAINERS.has(rest[0].f)) rest = stripLeading(rest.slice(1), DE);
      return { fraction, rest };
    }
  }
  return null;
}

function intentsFor(kind: Kind, body: Tok[]): VoiceIntent[] {
  const toks = kind === "add_to_list" || kind === "remove_from_list" ? stripListPhrase(body) : body;
  const out: VoiceIntent[] = [];
  for (const part of splitParts(toks)) {
    if (kind === "depleted" || kind === "remove_from_list") {
      const product = productName(kind === "depleted" ? stripLeading(part, new Set(["mais"])) : part);
      if (product) out.push({ kind, product });
    } else if (kind === "add_to_list") {
      const q = parseQty(part, false);
      const product = productName(q.rest);
      if (!product) continue;
      const intent: Extract<VoiceIntent, { kind: "add_to_list" }> = { kind, product };
      if (q.quantity !== undefined) intent.quantity = q.quantity;
      if (q.unit) intent.unit = q.unit;
      out.push(intent);
    } else {
      const fr = parseFraction(stripLeading(part, new Set(["o", "a", "os", "as"])));
      if (fr) {
        const product = productName(fr.rest);
        if (product) out.push({ kind, product, fraction: fr.fraction });
        continue;
      }
      const q = parseQty(part, true);
      const product = productName(q.rest);
      if (!product) continue;
      const intent: Extract<VoiceIntent, { kind: "used" }> = { kind, product };
      if (q.quantity !== undefined) intent.quantity = q.quantity;
      if (q.unit && q.unit !== "un") intent.unit = q.unit;
      out.push(intent);
    }
  }
  return out;
}

/**
 * Texto (transcrição) → intents. "acabou o leite e o pão" → 2 intents `depleted`.
 * Nada reconhecido → `[{ kind: 'unknown', text }]`.
 */
export function parseCommand(text: string): VoiceIntent[] {
  const raw = String(text ?? "").trim();
  const unknown: VoiceIntent[] = [{ kind: "unknown", text: raw }];
  let toks = tokenize(cleanTranscript(raw));
  while (toks.length > 1 && LEADING_FILLERS.has(toks[0].f) && !verbAt(toks, 0)) toks = toks.slice(1);
  if (!toks.length) return unknown;

  if (toks.every((t) => CANCEL_OK.has(t.f)) && toks.some((t) => CANCEL_CORE.has(t.f))) return [{ kind: "cancel" }];

  // Cláusulas: "acabou o leite e coloca pão na lista" → quebra em "e <verbo>".
  const clauses: { kind: Kind | null; body: Tok[] }[] = [];
  let i = 0;
  let current: { kind: Kind | null; body: Tok[] } | null = null;
  while (i < toks.length) {
    const atStart: boolean = i === 0 || (toks[i - 1].f === "e" && current !== null);
    const v: { kind: Kind; len: number } | null = atStart ? verbAt(toks, i) : null;
    if (v) {
      if (current && i > 0) current.body.pop(); // remove o "e" que separa as cláusulas
      current = { kind: v.kind, body: [] };
      clauses.push(current);
      i += v.len;
      continue;
    }
    if (!current) {
      current = { kind: null, body: [] };
      clauses.push(current);
    }
    current.body.push(toks[i]);
    i++;
  }

  const intents: VoiceIntent[] = [];
  for (const c of clauses) {
    if (c.kind) {
      intents.push(...intentsFor(c.kind, c.body));
    } else if (c.body.length > 1 && POSTFIX_DEPLETED.has(c.body[c.body.length - 1].f)) {
      // "o leite acabou"
      intents.push(...intentsFor("depleted", c.body.slice(0, -1)));
    }
  }
  return intents.length ? intents : unknown;
}
