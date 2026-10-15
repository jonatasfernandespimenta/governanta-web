"use client";

// 07 Produto: quando deve acabar (faixa), estoque estimado, uso recente, duração e preços.

import Link from "next/link";
import type { CSSProperties } from "react";
import { api, type GovernantaEvent, type ProductDetail } from "@/lib/api";
import { axisPct, band, betweenDays, estimateLong, HORIZON_DAYS, likelyDay, windowDays } from "@/lib/forecast";
import { agoLabel, capitalize, dayMonth, daysUntil, fractionGlyph, money, moneyBare, parseIso, qtyLabel, WEEKDAYS_SHORT } from "@/lib/format";
import { useResource } from "@/lib/useResource";
import { useKiosk } from "../shell/context";
import { BackButton, Bars, Eyebrow, Icon, OnListBadge } from "../ui";

function usageLog(events: GovernantaEvent[], id: string): string {
  const used = events.filter((e) => e.type === "PRODUCT_USED" && e.genericProductId === id).slice(0, 3);
  if (!used.length) return "sem registros de uso";
  return `usado: ${used
    .map((e) => {
      const f = typeof e.payload?.fraction === "number" ? fractionGlyph(e.payload.fraction) : typeof e.payload?.quantity === "number" ? String(e.payload.quantity) : "";
      return `${agoLabel(e.occurredAt)}${f ? ` ${f}` : ""}`;
    })
    .join(" · ")}`;
}

/** Embalagens desenhadas: a aberta com o que resta hachurado, as fechadas cheias, a da lista tracejada. */
function Packages({ p }: { p: ProductDetail }) {
  const n = Math.min(4, Math.max(p.stock.packages, p.stock.remainingFraction != null ? 1 : 0));
  return (
    <div className="packs" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="pack">
          <div className="pack-fill" style={{ height: `${Math.round((i === 0 ? (p.stock.remainingFraction ?? 1) : 1) * 100)}%` }} />
        </div>
      ))}
      {(p.onList || n === 0) && <div className="pack pack-empty" />}
    </div>
  );
}

export function ProdutoView({ id }: { id: string }) {
  const k = useKiosk();
  const prod = useResource((s) => api.getProduct(id, s), 60_000);
  const events = useResource((s) => api.getEvents(100, s), 60_000);
  const plan = useResource((s) => api.getPlanning(s), 5 * 60_000);
  const list = useResource((s) => api.getShoppingList(s), 60_000);
  const p = prod.data;

  if (!p) {
    return (
      <div className="page">
        <div className="page-head page-head-start">
          <BackButton fallback="/previsoes" />
          <h1 className="page-title page-title-detail">{prod.error ? "Produto não encontrado" : "Carregando…"}</h1>
        </div>
      </div>
    );
  }

  const f = p.forecast;
  const w = f ? windowDays(f) : null;
  const trip = plan.data?.nextTrip ?? null;
  const tripDays = trip ? daysUntil(trip) : null;
  const tripOnAxis = tripDays != null && tripDays >= 0 && tripDays <= HORIZON_DAYS;
  const between = f ? betweenDays(f) : null;

  async function addToList() {
    const item = await k.write(() => api.addListItem({ genericProductId: id }));
    if (item) {
      prod.mutate((d) => d && { ...d, onList: true, listItemId: item.id });
      k.toast(`${capitalize(p!.name)} adicionado à lista`, { undo: () => api.removeListItem(item.id) });
    }
  }

  function usedQuarter() {
    k.toast(`¼ de ${p!.name.toLowerCase()} registrado`, { commit: () => api.used({ genericProductId: id, fraction: 0.25, source: "touch" }) });
  }

  const prices = p.recentPrices;
  const listItem = (list.data ?? []).find((i) => i.id === p.listItemId);
  const listQty = listItem ? qtyLabel(listItem.quantity, listItem.unit) : "";

  return (
    <div className="page">
      <div className="page-head page-head-start">
        <BackButton fallback="/previsoes" />
        <div className="head-grow">
          <h1 className="page-title page-title-detail">{p.displayName}</h1>
          <div className="page-sub page-sub-subtle">{p.location ?? "Sem lugar definido"}</div>
        </div>
        <div className="head-actions">
          <Link href={`/produto/${id}/precos`} className="btn btn-outline">
            Comparar preços
          </Link>
          {p.onList ? (
            <OnListBadge size="lg">{listQty ? `Na lista · ${listQty}` : "Na lista"}</OnListBadge>
          ) : (
            <button type="button" className="btn btn-primary" onClick={addToList}>
              Adicionar à lista
            </button>
          )}
        </div>
      </div>

      <div className="page-body produto-grid">
        <section className={`card produto-main${tripOnAxis && axisPct(tripDays ?? 0) < 30 ? " near" : ""}`} style={{ "--trip": `${tripOnAxis ? axisPct(tripDays) : 0}%` } as CSSProperties}>
          <Eyebrow>Provavelmente acaba</Eyebrow>
          {f && w ? (
            <>
              <div className="produto-day">{likelyDay(f)}</div>
              <div className="produto-est">
                estimativa: {estimateLong(w)}
                {between ? ` · ${between}` : ""}
                {f.method === "diet" ? " · pela dieta" : ""}
                {f.confidence === "low" ? " · pouca certeza" : ""}
              </div>
              <div className="track track-lg">
                <span className="track-base" />
                <span className="track-band" style={band(w)} />
                {tripOnAxis && <span className="track-trip" />}
              </div>
              <div className="axis-labels">
                <span>hoje</span>
                {tripOnAxis && trip && <span className="axis-trip">{WEEKDAYS_SHORT[parseIso(trip).getDay()]} · próxima compra</span>}
                <span>+{HORIZON_DAYS} dias</span>
              </div>
            </>
          ) : (
            <>
              <div className="produto-day produto-day-muted">ainda aprendendo</div>
              <div className="produto-est">Preciso de mais 1 ou 2 compras deste produto para estimar quando acaba.</div>
            </>
          )}
          <div className="flex-1" />
          <div className="produto-stock">
            <Packages p={p} />
            <div>
              <Eyebrow>Estoque estimado</Eyebrow>
              <div className="produto-stock-label">{p.stock.label}</div>
              <div className="produto-stock-log">{events.data ? usageLog(events.data, id) : " "}</div>
            </div>
            <button type="button" className="btn btn-outline btn-icon" onClick={usedQuarter}>
              <Icon name="restaurant" size={26} />
              Usei ¼
            </button>
          </div>
        </section>

        <div className="produto-stats">
          <div className="stat">
            <Eyebrow>Duração típica</Eyebrow>
            <div className="stat-value">{p.typicalDuration ? `${p.typicalDuration.minDays}–${p.typicalDuration.maxDays} dias` : "—"}</div>
            <div className="stat-sub">{p.typicalDuration?.perLabel ?? "ainda sem histórico"}</div>
          </div>
          <div className="stat">
            <Eyebrow>Última compra</Eyebrow>
            <div className="stat-value">{p.lastPurchase ? dayMonth(p.lastPurchase.date) : "—"}</div>
            <div className="stat-sub">{p.lastPurchase ? [p.lastPurchase.quantityLabel, p.lastPurchase.merchantName].filter(Boolean).join(" · ") : "nenhuma nota com este produto"}</div>
          </div>
          <div className="stat">
            <Eyebrow>Preço pago</Eyebrow>
            <div className="stat-value num">
              {p.lastPriceCents != null ? (
                <>
                  {money(p.lastPriceCents)} <span className="stat-unit">cada</span>
                </>
              ) : (
                "—"
              )}
            </div>
            <div className="stat-sub num">{p.avgPriceCents != null ? `média ${money(p.avgPriceCents)} em ${p.priceCount} ${p.priceCount === 1 ? "compra" : "compras"}` : "sem preços registrados"}</div>
          </div>
          <div className="stat">
            <Eyebrow>Costuma comprar</Eyebrow>
            <div className="stat-value">{p.usualMerchant?.name ?? "—"}</div>
            <div className="stat-sub">{p.usualMerchant ? `${p.usualMerchant.count} de ${p.usualMerchant.total} compras` : "ainda sem mercado preferido"}</div>
          </div>
          <div className="stat stat-wide">
            <Eyebrow>{prices.length ? `Preço nas últimas ${prices.length} compras` : "Preço nas últimas compras"}</Eyebrow>
            {prices.length ? (
              <Bars
                className="bars-product"
                bars={prices.map((r, i) => ({
                  key: `${r.date}-${i}`,
                  top: moneyBare(r.priceCents),
                  label: dayMonth(r.date),
                  value: r.priceCents,
                  current: i === prices.length - 1,
                }))}
              />
            ) : (
              <div className="stat-sub stat-empty">Os preços aparecem quando você escaneia as notas.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
