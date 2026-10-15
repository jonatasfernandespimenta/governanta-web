// Nome falado → produto do catálogo, via GET /products?q= (a API faz busca accent/case-insensitive,
// com fuzzy pg_trgm quando disponível). Aqui decidimos se a resposta é uma só, ambígua ou vazia.
// Sem dependências em runtime (testável no Node com fetch falso).

import type { ResolveResult, VoiceProduct } from "./types";

export const MAX_CANDIDATES = 4;

const apiUrl = () => (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3101").replace(/\/$/, "");

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function bigrams(s: string): string[] {
  const t = ` ${s} `;
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

/** Similaridade 0..1 entre o nome falado e o do catálogo (Dice de bigramas, com bônus de palavra inteira). */
export function similarity(spoken: string, name: string): number {
  const a = fold(spoken);
  const b = fold(name);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  const pool = new Map<string, number>();
  for (const g of B) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hits = 0;
  for (const g of A) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      hits++;
      pool.set(g, n - 1);
    }
  }
  const dice = (2 * hits) / (A.length + B.length);
  // "pão de forma" falado e "Pão de forma integral" no catálogo: todas as palavras ditas estão lá.
  const words = b.split(" ");
  const covered = a.split(" ").every((w) => words.includes(w));
  return Math.min(1, covered ? Math.max(dice, 0.5) + 0.1 : dice);
}

/** Variantes no singular, para tentar quando a busca literal não acha nada ("pães" → "pão"). */
export function singularVariants(name: string): string[] {
  const out = new Set<string>();
  const words = name.trim().split(/\s+/);
  const first = words[0] ?? "";
  const swap = (w: string) => [w, ...words.slice(1)].join(" ");
  if (/ães$/.test(first)) out.add(swap(first.replace(/ães$/, "ão")));
  if (/ões$/.test(first)) out.add(swap(first.replace(/ões$/, "ão")));
  if (/aes$/.test(first)) out.add(swap(first.replace(/aes$/, "ao")));
  if (/oes$/.test(first)) out.add(swap(first.replace(/oes$/, "ao")));
  if (/(r|z)es$/.test(first)) out.add(swap(first.slice(0, -2)));
  if (/is$/.test(first)) out.add(swap(first.replace(/is$/, "l")));
  if (/s$/.test(first)) out.add(swap(first.slice(0, -1)));
  out.delete(name.trim());
  return [...out];
}

async function search(q: string, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<VoiceProduct[]> {
  const res = await fetchImpl(`${apiUrl()}/products?q=${encodeURIComponent(q)}`, { cache: "no-store", signal });
  if (!res.ok) throw new Error(`GET /products?q= → ${res.status}`);
  const body = (await res.json()) as { products?: VoiceProduct[] } | VoiceProduct[];
  return (Array.isArray(body) ? body : (body.products ?? [])).filter((p) => p && p.id && p.name);
}

/** Decide one/many/none a partir da lista que a API devolveu (já ordenada por relevância). */
export function decide(name: string, products: VoiceProduct[]): ResolveResult {
  if (!products.length) return { status: "none" };
  const target = fold(name);
  const exact = products.filter((p) => fold(p.name) === target);
  if (exact.length >= 1) return { status: "one", product: exact[0] };

  // Ordenação estável por similaridade (empate mantém a ordem da API).
  const scored = products
    .map((p, i) => ({ p, i, s: similarity(name, p.name) }))
    .sort((x, y) => y.s - x.s || x.i - y.i);
  const [top, second] = scored;
  if (!second) {
    return top.s >= 0.5 ? { status: "one", product: top.p } : { status: "many", candidates: [top.p] };
  }
  if (top.s >= 0.8 && top.s - second.s >= 0.25) return { status: "one", product: top.p };
  return { status: "many", candidates: scored.slice(0, MAX_CANDIDATES).map((x) => x.p) };
}

/**
 * Resolve o nome de um produto falado. "leite" com "Leite condensado", "Leite desnatado", "Leite de coco"
 * → `many`; "papel higienico" com "Papel higiênico" → `one`; nada → `none`. Erro de rede: rejeita.
 */
export async function resolveProduct(
  name: string,
  opts: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<ResolveResult> {
  const q = name.trim();
  if (!q) return { status: "none" };
  const fetchImpl = opts.fetch ?? fetch;
  let products = await search(q, fetchImpl, opts.signal);
  if (!products.length) {
    for (const v of singularVariants(q)) {
      products = await search(v, fetchImpl, opts.signal);
      if (products.length) return decide(v, products);
    }
  }
  return decide(q, products);
}
