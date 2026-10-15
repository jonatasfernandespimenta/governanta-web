"use client";

// 13 Comparação de preços: último preço por mercado e média paga por mês.

import { api } from "@/lib/api";
import { capitalize, daysUntil, dayMonth, MONTHS, MONTHS_SHORT, money } from "@/lib/format";
import { useResource } from "@/lib/useResource";
import { useKiosk } from "../shell/context";
import { BackButton, Bars, EmptyState, Eyebrow, Icon, OnListBadge } from "../ui";

const monthIdx = (ym: string) => Number(ym.slice(5, 7)) - 1;

export function PrecosView({ id }: { id: string }) {
  const k = useKiosk();
  const prices = useResource((s) => api.getProductPrices(id, s), 5 * 60_000);
  const prod = useResource((s) => api.getProduct(id, s), 60_000);
  const d = prices.data;

  async function addToList() {
    const item = await k.write(() => api.addListItem({ genericProductId: id }));
    if (item) {
      prod.mutate((x) => x && { ...x, onList: true, listItemId: item.id });
      k.toast(`${capitalize(d?.name ?? "Produto")} adicionado à lista`, { undo: () => api.removeListItem(item.id) });
    }
  }

  const first = d?.monthly[0];
  const sub = d
    ? [d.location, d.recordCount ? `${d.recordCount} ${d.recordCount === 1 ? "registro" : "registros"} em ${d.monthsSpan} ${d.monthsSpan === 1 ? "mês" : "meses"}` : "sem registros"]
        .filter(Boolean)
        .join(" · ")
    : prices.error
      ? "Não consegui carregar os preços."
      : "Carregando…";

  return (
    <div className="page">
      <div className="page-head page-head-start">
        <BackButton fallback={`/produto/${id}`} />
        <div className="head-grow">
          <h1 className="page-title page-title-detail">{d ? capitalize(d.name) : "Preços"}</h1>
          <div className="page-sub page-sub-subtle">{sub}</div>
        </div>
        {prod.data &&
          (prod.data.onList ? (
            <OnListBadge size="lg">Na lista</OnListBadge>
          ) : (
            <button type="button" className="btn btn-primary" onClick={addToList}>
              Adicionar à lista
            </button>
          ))}
      </div>

      {d && d.recordCount === 0 ? (
        <EmptyState icon="sell" title="Ainda sem preços deste produto">
          Os preços aparecem quando você escaneia as notas em que ele aparece.
        </EmptyState>
      ) : (
        d && (
          <div className="page-body precos-grid">
            <section className="card precos-merchants">
              <Eyebrow>Último preço visto em cada mercado</Eyebrow>
              {d.byMerchant.map((m) => (
                <div key={m.merchantName} className="merchant-row">
                  <div>
                    <div className="merchant-name">
                      {m.merchantName}
                      {m.isLowest && d.byMerchant.length > 1 && <span className="tag">menor preço visto</span>}
                    </div>
                    <div className="merchant-sub">
                      {daysUntil(m.lastSeen) === 0 ? "hoje" : dayMonth(m.lastSeen)} · {m.count} {m.count === 1 ? "registro" : "registros"}
                    </div>
                  </div>
                  <div className="merchant-price num">{money(m.lastPriceCents)}</div>
                </div>
              ))}
              <div className="flex-1" />
              {d.fewRecords && (
                <div className="info-box">
                  <Icon name="info" size={26} className="tone-subtle" />
                  Ainda são poucos registros. Não dá para dizer que um mercado é sempre mais barato.
                </div>
              )}
            </section>
            <section className="card precos-monthly">
              <div className="row-between">
                <Eyebrow>Preço pago por mês</Eyebrow>
                {d.changePct != null && first && (
                  <div className="precos-change num">
                    {d.changePct > 0 ? "+" : ""}
                    {Math.round(d.changePct)}% desde {MONTHS[monthIdx(first.month)]}
                  </div>
                )}
              </div>
              <Bars
                className="bars-monthly"
                bars={d.monthly.map((m, i) => ({
                  key: m.month,
                  top: money(m.avgPriceCents),
                  label: capitalize(MONTHS_SHORT[monthIdx(m.month)]),
                  value: m.avgPriceCents,
                  current: i === d.monthly.length - 1,
                }))}
              />
            </section>
          </div>
        )
      )}
    </div>
  );
}
