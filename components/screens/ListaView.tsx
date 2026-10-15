"use client";

// 04 Lista: itens por lugar da casa, marcar comprado, quantidade, remover e limpar comprados.

import { useState } from "react";
import { api, LOCATIONS, type ShoppingListItem } from "@/lib/api";
import { forecastPhrase } from "@/lib/forecast";
import { agoLabel, capitalize, qtyLabel, qtyStep } from "@/lib/format";
import { useResource } from "@/lib/useResource";
import { useKiosk } from "../shell/context";
import { EmptyState, Eyebrow, Icon, OriginDot, originOf } from "../ui";

type Filter = "todos" | "previstos" | "adicionados";
const FILTERS: [Filter, string][] = [
  ["todos", "Todos"],
  ["previstos", "Previstos"],
  ["adicionados", "Adicionados"],
];
const OTHER = "Outros";

const isBought = (i: ShoppingListItem) => i.status !== "open";

export function ListaView() {
  const k = useKiosk();
  const list = useResource((s) => api.getShoppingList(s, true), 15_000);
  const inv = useResource((s) => api.getInventory(s), 5 * 60_000);
  const fc = useResource((s) => api.getForecast(s), 5 * 60_000);
  const [filter, setFilter] = useState<Filter>("todos");
  const [editing, setEditing] = useState<string | null>(null);
  // Itens escondidos enquanto o aviso com Desfazer está na tela (a remoção só grava depois).
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const place = new Map((inv.data ?? []).map((i) => [i.genericProductId, i.location]));
  const forecast = new Map((fc.data ?? []).map((f) => [f.genericProductId, f]));
  const items = (list.data ?? []).filter((i) => !hidden.has(i.id));
  const toBuy = items.filter((i) => !isBought(i)).length;
  const bought = items.filter(isBought);

  const shown = items.filter((i) => filter === "todos" || (filter === "previstos" ? i.reason === "forecast" : i.reason !== "forecast"));
  const groups = new Map<string, ShoppingListItem[]>();
  for (const loc of LOCATIONS) groups.set(loc, []);
  for (const it of shown) {
    const loc = it.location ?? (it.genericProductId ? place.get(it.genericProductId) : null) ?? OTHER;
    if (!groups.has(loc)) groups.set(loc, []);
    groups.get(loc)!.push(it);
  }
  const other = groups.get(OTHER);
  if (other) {
    groups.delete(OTHER);
    groups.set(OTHER, other);
  }

  function patch(it: ShoppingListItem, change: Partial<ShoppingListItem>) {
    list.mutate((prev) => prev?.map((x) => (x.id === it.id ? { ...x, ...change } : x)));
    void k.write(() => api.updateListItem(it.id, { status: change.status, quantity: change.quantity, unit: change.unit }));
  }

  function step(it: ShoppingListItem, dir: 1 | -1) {
    const unit = it.unit ?? "un";
    const s = qtyStep(unit);
    const next = Math.max(s, Math.round(((it.quantity ?? 0) + dir * s) * 1000) / 1000);
    patch(it, { quantity: next, unit });
  }

  function hide(ids: string[]) {
    setHidden((h) => new Set([...h, ...ids]));
  }
  function unhide(ids: string[]) {
    setHidden((h) => new Set([...h].filter((x) => !ids.includes(x))));
  }

  function remove(it: ShoppingListItem) {
    setEditing(null);
    hide([it.id]);
    k.toast(`${capitalize(it.name)} removido da lista`, {
      undo: async () => unhide([it.id]),
      commit: () => api.removeListItem(it.id),
    });
  }

  function clearBought() {
    if (!bought.length) return;
    const ids = bought.map((i) => i.id);
    hide(ids);
    k.toast(`${ids.length} ${ids.length === 1 ? "item comprado removido" : "itens comprados removidos"}`, {
      undo: async () => unhide(ids),
      commit: () => api.clearPurchased(),
    });
  }

  function note(it: ShoppingListItem): string {
    if (it.reason === "forecast") {
      const f = it.genericProductId ? forecast.get(it.genericProductId) : undefined;
      return f ? `previsto · ${forecastPhrase(f).replace("provavelmente ", "")}` : "previsto";
    }
    if (it.reason === "manual") return `adicionado ${agoLabel(it.addedAt)}`;
    if (it.reason === "low_stock") return `pouco estoque · ${agoLabel(it.addedAt)}`;
    return `acabou · marcado ${agoLabel(it.addedAt)}`;
  }

  const empty = list.data && items.length === 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Lista de compras</h1>
          <div className="page-sub">
            {list.data ? `${toBuy} para comprar · ${bought.length} ${bought.length === 1 ? "comprado" : "comprados"}` : "Carregando…"}
          </div>
        </div>
        <div className="head-actions">
          <div className="seg" role="tablist" aria-label="Filtro">
            {FILTERS.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-outline btn-wrap" disabled={!bought.length} onClick={clearBought}>
            Limpar comprados
          </button>
          <button type="button" className="btn btn-primary btn-icon" onClick={() => k.openSheet("add")}>
            <Icon name="add" />
            Adicionar
          </button>
        </div>
      </div>

      {empty ? (
        <EmptyState
          icon="checklist"
          title="A lista está vazia"
          actions={
            <>
              <button type="button" className="btn btn-outline btn-md btn-icon" onClick={k.startVoice}>
                <Icon name="mic" />
                Falar
              </button>
              <button type="button" className="btn btn-primary btn-md" onClick={() => k.openSheet("add")}>
                Adicionar item
              </button>
            </>
          }
        >
          Quando algo acabar, diga “acabou o café” ou toque em Adicionar. Itens previstos também aparecem aqui.
        </EmptyState>
      ) : (
        <div className="page-scroll lista-body">
          <div className="lista-groups">
            {[...groups].map(([loc, group]) =>
              group.length === 0 ? null : (
                <section key={loc} className="lista-group" aria-label={loc}>
                  <div className="lista-group-head">
                    <Eyebrow>{loc}</Eyebrow>
                    <span className="tone-subtle num">{group.length}</span>
                  </div>
                  {group.map((it) => {
                    const checked = isBought(it);
                    const isEditing = editing === it.id;
                    return (
                      <div key={it.id} className={`lista-item${checked ? " checked" : ""}`}>
                        <button
                          type="button"
                          className="check"
                          role="checkbox"
                          aria-checked={checked}
                          aria-label={`Marcar ${it.name} como comprado`}
                          onClick={() => patch(it, { status: checked ? "open" : "purchased" })}
                        >
                          {checked && <Icon name="check" size={36} />}
                        </button>
                        <div className="lista-text">
                          <div className="lista-name">{capitalize(it.name)}</div>
                          {!isEditing && (
                            <div className="lista-note">
                              <OriginDot origin={originOf(it.reason)} size={13} />
                              {note(it)}
                            </div>
                          )}
                        </div>
                        {isEditing ? (
                          <div className="qty-edit">
                            <button type="button" className="circle" aria-label="Menos" onClick={() => step(it, -1)}>
                              <Icon name="remove" size={28} />
                            </button>
                            <div className="qty-value num">{qtyLabel(it.quantity, it.unit) || "—"}</div>
                            <button type="button" className="circle" aria-label="Mais" onClick={() => step(it, 1)}>
                              <Icon name="add" size={28} />
                            </button>
                            <button type="button" className="circle circle-bad" aria-label={`Remover ${it.name}`} onClick={() => remove(it)}>
                              <Icon name="delete" size={28} />
                            </button>
                            <button type="button" className="circle circle-primary" aria-label="Pronto" onClick={() => setEditing(null)}>
                              <Icon name="check" size={28} />
                            </button>
                          </div>
                        ) : (
                          <button type="button" className="qty-btn num" aria-label={`Quantidade de ${it.name}`} onClick={() => setEditing(it.id)}>
                            {qtyLabel(it.quantity, it.unit) || "qtd."}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </section>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
