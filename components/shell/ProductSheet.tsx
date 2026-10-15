"use client";

// Folha de baixo para escolher um produto: "Adicionar à lista", "O que acabou?" e "O que vocês usaram?".
// Busca com microfone, "Mais frequentes" e, no "Usei", a quantidade (¼ ½ ¾ Tudo) em cada cartão.
// Em "pick" só devolve a escolha (produto do catálogo ou nome de um novo) para a tela que abriu.

import { useEffect, useState } from "react";
import { api, type InventoryItem, type Product } from "@/lib/api";
import { capitalize, fractionGlyph, stockLeft } from "@/lib/format";
import { Eyebrow, Icon } from "../ui";
import { useKiosk, type SheetKind } from "./context";

/** Escolha feita no modo "pick". */
export type PickedProduct = { genericProductId: string; name: string } | { newProductName: string };

const META: Record<SheetKind | "pick", { title: string; sub: string }> = {
  add: { title: "Adicionar à lista", sub: "Toque para adicionar. Ajuste a quantidade depois, na lista." },
  acabou: { title: "O que acabou?", sub: "Toque no produto. Ele entra na lista marcado como “acabou”." },
  usei: { title: "O que vocês usaram?", sub: "Opcional — cada registro deixa a previsão mais certeira." },
  pick: { title: "Qual produto é?", sub: "Toque no produto certo ou escreva o nome de um produto novo." },
};

const FRACTIONS = [
  { f: 0.25, label: "¼" },
  { f: 0.5, label: "½" },
  { f: 0.75, label: "¾" },
  { f: 1, label: "Tudo" },
];

const SHOWN = 8;

/** Produtos do catálogo: frequentes com a busca vazia, resultado da busca (com debounce) com texto. */
function useProducts(query: string) {
  const q = query.trim();
  const [result, setResult] = useState<{ q: string; products: Product[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(
      async () => {
        try {
          const products = q ? await api.searchProducts(q, ctrl.signal) : await api.frequentProducts(ctrl.signal);
          setResult({ q, products });
          setFailed(false);
        } catch (err) {
          if ((err as Error).name !== "AbortError") setFailed(true);
        }
      },
      q ? 180 : 0,
    );
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);
  return { products: result?.products ?? [], loading: result?.q !== q && !failed, failed };
}

export function ProductSheet({
  kind,
  initialQuery,
  onClose,
  onVoice,
  onPick,
  title,
}: {
  kind: SheetKind | "pick";
  initialQuery: string;
  onClose: () => void;
  onVoice?: () => void;
  onPick?: (p: PickedProduct) => void;
  title?: string;
}) {
  const k = useKiosk();
  const [query, setQuery] = useState(initialQuery);
  const { products, loading, failed } = useProducts(query);
  const [stock, setStock] = useState<Map<string, InventoryItem>>(new Map());
  const [busy, setBusy] = useState(false);
  const q = query.trim();

  useEffect(() => {
    if (kind !== "usei") return;
    const ctrl = new AbortController();
    api
      .getInventory(ctrl.signal)
      .then((items) => setStock(new Map(items.map((i) => [i.genericProductId, i]))))
      .catch(() => {});
    return () => ctrl.abort();
  }, [kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function add(p: Product) {
    onClose();
    if (p.onList) {
      k.toast(`${capitalize(p.name)} já está na lista`);
      return;
    }
    const item = await k.write(() => api.addListItem({ genericProductId: p.id }));
    if (item) k.toast(`${capitalize(p.name)} adicionado à lista`, { undo: () => api.removeListItem(item.id) });
  }

  async function addFree(text: string) {
    onClose();
    const item = await k.write(() => api.addListItem({ freeText: text }));
    if (item) k.toast(`${text} adicionado à lista`, { undo: () => api.removeListItem(item.id) });
  }

  function acabou(p: Product) {
    onClose();
    k.toast(`${capitalize(p.name)} acabou — está na lista`, { commit: () => api.depleted(p.id, "touch") });
  }

  async function acabouNew(name: string) {
    setBusy(true);
    const p = await k.write(() => api.createProduct(name));
    setBusy(false);
    if (p) acabou(p);
  }

  function used(p: Product, fraction: number) {
    onClose();
    const inv = stock.get(p.id);
    const commit = () => api.used({ genericProductId: p.id, fraction, source: "touch" });
    const left = inv && inv.remainingFraction != null ? Math.max(0, inv.remainingFraction - fraction) : null;
    const lastPackage = !inv || inv.packages <= 1;
    if (lastPackage && (fraction >= 1 || (left != null && left <= 0.05))) {
      k.toast(`${capitalize(p.name)} acabou — vai para a lista`, { commit });
      return;
    }
    const rest = left != null ? stockLeft(left, inv!.packages) : null;
    k.toast(rest ? `Registrado · restam ${rest.replace("~", "")} de ${p.name.toLowerCase()}` : `Registrado: ${fractionGlyph(fraction)} de ${p.name.toLowerCase()}`, { commit });
  }

  function choose(p: Product) {
    if (kind === "pick") {
      onClose();
      onPick?.({ genericProductId: p.id, name: p.name });
    } else if (kind === "add") void add(p);
    else acabou(p);
  }

  function chooseNew(text: string) {
    if (kind === "pick") {
      onClose();
      onPick?.({ newProductName: text });
    } else if (kind === "add") void addFree(text);
    else void acabouNew(text);
  }

  const meta = META[kind];
  const shown = products.slice(0, SHOWN);
  const exact = shown.some((p) => p.name.toLowerCase() === q.toLowerCase());

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden />
      <div className={`sheet${kind === "usei" ? " sheet-tall" : ""}`} role="dialog" aria-modal aria-labelledby="sheet-title">
        <div className="sheet-grip" />
        <div className="sheet-head">
          <div>
            <div id="sheet-title" className="sheet-title">
              {title ?? meta.title}
            </div>
            <div className="sheet-sub">{meta.sub}</div>
          </div>
          <button type="button" className="round-btn round-btn-dark" aria-label="Fechar" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        <label className={`search${kind === "usei" ? " search-compact" : ""}`}>
          <Icon name="search" className="tone-subtle" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar produto…"
            aria-label="Buscar produto"
            autoComplete="off"
            enterKeyHint="search"
          />
          {onVoice && (
            <button type="button" className="search-mic" aria-label="Falar" onClick={onVoice}>
              <Icon name="mic" size={28} />
            </button>
          )}
        </label>

        <Eyebrow className="sheet-eyebrow">{kind === "usei" ? "Toque na quantidade" : q ? "Resultados" : "Mais frequentes"}</Eyebrow>

        <div className="sheet-scroll">
          {failed && <div className="sheet-note">Não consegui buscar os produtos agora.</div>}
          {!failed && !loading && shown.length === 0 && !q && <div className="sheet-note">Os produtos mais usados aparecem aqui.</div>}

          {kind === "usei" ? (
            <div className="use-grid">
              {shown.map((p) => {
                const inv = stock.get(p.id);
                const left = inv ? stockLeft(inv.remainingFraction, inv.packages) : null;
                return (
                  <div key={p.id} className="use-card">
                    <div className="use-name">{capitalize(p.name)}</div>
                    <div className="use-left">{left ? `restam ${left}` : "estoque desconhecido"}</div>
                    <div className="use-opts">
                      {FRACTIONS.map((o) => (
                        <button key={o.f} type="button" onClick={() => used(p, o.f)} aria-label={`Usei ${o.label} de ${p.name}`}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="freq-grid">
              {shown.map((p) => (
                <button key={p.id} type="button" className="freq" onClick={() => choose(p)}>
                  <span className="freq-name">{capitalize(p.name)}</span>
                  <span className="freq-sub">{p.onList && kind !== "pick" ? "já na lista" : (p.location ?? "")}</span>
                </button>
              ))}
              {q && !loading && !exact && (
                <button type="button" className="freq freq-new" disabled={busy} onClick={() => chooseNew(q)}>
                  <span className="freq-name">
                    <Icon name="add" size={26} /> “{q}”
                  </span>
                  <span className="freq-sub">{kind === "add" ? "adicionar como item novo" : kind === "pick" ? "cadastrar como produto novo" : "cadastrar e marcar que acabou"}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
