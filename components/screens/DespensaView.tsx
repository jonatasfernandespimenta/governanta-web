"use client";

// Despensa: o que tem em casa por lugar, com validade, o que resta, Acabou / Joguei fora,
// e ajustes de lugar e duração esperada (prior da previsão).

import { useState } from "react";
import { api, LOCATIONS, type InventoryItem, type Location } from "@/lib/api";
import { forecastPhrase } from "@/lib/forecast";
import { capitalize, dayMonth, normalize, stockLeft } from "@/lib/format";
import { useResource } from "@/lib/useResource";
import { useKiosk } from "../shell/context";
import { BackButton, EmptyState, Eyebrow, Icon } from "../ui";

const NO_PLACE = "Sem lugar";

function expiry(item: InventoryItem): { text: string; tone: "bad" | "warn" | "" } | null {
  const d = item.daysToExpiry;
  if (d == null || !item.expiresAt) return null;
  if (d < 0) return { text: `venceu ${dayMonth(item.expiresAt)}`, tone: "bad" };
  if (d === 0) return { text: "vence hoje", tone: "bad" };
  if (d === 1) return { text: "vence amanhã", tone: "warn" };
  if (d <= 7) return { text: `vence em ${d} dias`, tone: "warn" };
  return { text: `val. ${dayMonth(item.expiresAt)}`, tone: "" };
}

function details(item: InventoryItem): string {
  const pkg = item.packageQty != null ? `${item.packageQty.toLocaleString("pt-BR")}${item.packageUnit ? ` ${item.packageUnit}` : ""}` : null;
  return [item.brand, pkg, stockLeft(item.remainingFraction, item.packages)].filter(Boolean).join(" · ");
}

export function DespensaView() {
  const k = useKiosk();
  const inv = useResource((s) => api.getInventory(s), 60_000);
  const fc = useResource((s) => api.getForecast(s), 5 * 60_000);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const forecast = new Map((fc.data ?? []).map((f) => [f.genericProductId, f]));
  const q = normalize(query);
  const items = (inv.data ?? []).filter((i) => !gone.has(i.genericProductId) && (!q || normalize(`${i.name} ${i.brand ?? ""}`).includes(q)));

  const groups = new Map<string, InventoryItem[]>();
  for (const loc of LOCATIONS) groups.set(loc, []);
  for (const it of items) {
    const key = it.location ?? NO_PLACE;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  const noPlace = groups.get(NO_PLACE);
  if (noPlace) {
    groups.delete(NO_PLACE);
    groups.set(NO_PLACE, noPlace);
  }

  function end(item: InventoryItem, kind: "depleted" | "discarded") {
    const id = item.genericProductId;
    setGone((g) => new Set([...g, id]));
    const name = capitalize(item.name);
    k.toast(kind === "depleted" ? `${name} acabou — está na lista` : `${name} foi para o lixo`, {
      undo: async () => setGone((g) => new Set([...g].filter((x) => x !== id))),
      commit: () => (kind === "depleted" ? api.depleted(id, "touch") : api.discarded(id, "touch")),
    });
  }

  async function update(item: InventoryItem, patch: { location?: Location | null; expectedDurationDays?: number | null }) {
    inv.mutate((prev) => prev?.map((i) => (i.genericProductId === item.genericProductId ? { ...i, ...patch } : i)));
    await k.write(() => api.updateProduct(item.genericProductId, patch));
  }

  return (
    <div className="page">
      <div className="page-head page-head-start">
        <BackButton fallback="/" />
        <div className="head-grow">
          <h1 className="page-title">Despensa</h1>
          <div className="page-sub">{inv.data ? `${inv.data.length} ${inv.data.length === 1 ? "produto" : "produtos"} em casa` : "Carregando…"}</div>
        </div>
        <label className="search search-compact desp-search">
          <Icon name="search" className="tone-subtle" />
          <input type="search" placeholder="Buscar produto ou marca" aria-label="Buscar produto ou marca" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button type="button" className="circle" aria-label="Adicionar à despensa" aria-expanded={adding} onClick={() => setAdding(!adding)}>
          <Icon name={adding ? "close" : "add"} size={26} />
        </button>
      </div>
      {adding && <AddForm onDone={() => setAdding(false)} />}

      {inv.data && inv.data.length === 0 ? (
        <EmptyState icon="kitchen" title="Nada registrado na despensa">
          Os produtos aparecem aqui quando uma nota é escaneada ou uma compra é registrada.
        </EmptyState>
      ) : (
        <div className="page-scroll desp-body">
          {inv.data && items.length === 0 && <div className="tone-muted">Nenhum produto com esse nome.</div>}
          {[...groups].map(([place, group]) =>
            group.length === 0 ? null : (
              <section key={place} className="desp-group" aria-label={place}>
                <div className="lista-group-head">
                  <Eyebrow>{place}</Eyebrow>
                  <span className="tone-subtle num">{group.length}</span>
                </div>
                {group.map((item, i) => {
                  const ex = expiry(item);
                  const f = forecast.get(item.genericProductId);
                  const key = `${item.genericProductId}:${item.expiresAt ?? "-"}:${i}`;
                  const pct = item.remainingFraction == null ? null : Math.round(Math.min(1, Math.max(0, item.remainingFraction)) * 100);
                  return (
                    <div key={key} className={`desp-item${ex?.tone === "bad" ? " bad" : ""}`}>
                      <div className="desp-main">
                        <div className="desp-name">
                          {capitalize(item.name)}
                          {ex && <span className={`tag${ex.tone ? ` tag-${ex.tone}` : ""}`}>{ex.text}</span>}
                        </div>
                        <div className="desp-sub">{[details(item), f && !f.irregular && f.windowStart ? forecastPhrase(f) : null].filter(Boolean).join(" · ") || "sem detalhes"}</div>
                        {pct != null && (
                          <div className="desp-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Quanto resta">
                            <i style={{ width: `${pct}%` }} />
                          </div>
                        )}
                        {open === key && (
                          <div className="desp-edit">
                            <select
                              className="desp-select"
                              aria-label={`Lugar de ${item.name}`}
                              value={item.location ?? ""}
                              onChange={(e) => update(item, { location: (e.target.value || null) as Location | null })}
                            >
                              <option value="">Sem lugar</option>
                              {item.location && !(LOCATIONS as readonly string[]).includes(item.location) && <option value={item.location}>{item.location}</option>}
                              {LOCATIONS.map((l) => (
                                <option key={l} value={l}>
                                  {l}
                                </option>
                              ))}
                            </select>
                            <Duration item={item} onSave={(d) => update(item, { expectedDurationDays: d })} />
                          </div>
                        )}
                      </div>
                      <div className="desp-actions">
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => end(item, "depleted")}>
                          Acabou
                        </button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => end(item, "discarded")}>
                          Joguei fora
                        </button>
                        <button type="button" className="circle" aria-label={`Ajustar ${item.name}`} aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>
                          <Icon name={open === key ? "expand_less" : "tune"} size={26} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </section>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** Compra registrada à mão: nome (produto novo ou existente), quantas embalagens e validade opcional. */
function AddForm({ onDone }: { onDone: () => void }) {
  const k = useKiosk();
  const [name, setName] = useState("");
  const [packages, setPackages] = useState("1");
  const [expiresAt, setExpiresAt] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.max(1, Math.round(Number(packages) || 1));
    const ok = await k.write(() => api.purchase([{ freeText: name.trim(), packages: n, ...(expiresAt ? { expiresAt } : {}) }]));
    if (!ok) return;
    k.toast(`${capitalize(name.trim())} na despensa`);
    onDone();
  }
  return (
    <form className="desp-edit desp-add" onSubmit={submit}>
      <input className="desp-select" required maxLength={100} placeholder="Produto (ex.: ketchup)" aria-label="Produto" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="desp-duration">
        <input className="num" type="number" inputMode="numeric" min={1} max={99} aria-label="Quantas embalagens" value={packages} onChange={(e) => setPackages(e.target.value)} />
        un
      </label>
      <label className="desp-duration">
        Validade
        <input className="desp-select" type="date" aria-label="Validade (opcional)" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
      </label>
      <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim()}>
        Adicionar
      </button>
    </form>
  );
}

/** "Dura ~__ dias": palpite da casa para itens sem histórico. Salva ao sair do campo. */
function Duration({ item, onSave }: { item: InventoryItem; onSave: (d: number | null) => void }) {
  const saved = item.expectedDurationDays ?? null;
  const [text, setText] = useState(saved != null ? String(saved) : "");
  function commit() {
    const n = text.trim() ? Math.round(Number(text)) : null;
    if (n != null && (!Number.isFinite(n) || n < 1 || n > 365)) {
      setText(saved != null ? String(saved) : "");
      return;
    }
    if (n !== saved) onSave(n);
  }
  return (
    <label className="desp-duration">
      Dura ~
      <input
        className="num"
        type="number"
        inputMode="numeric"
        min={1}
        max={365}
        placeholder="?"
        aria-label={`Quantos dias ${item.name} costuma durar`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      dias
    </label>
  );
}
