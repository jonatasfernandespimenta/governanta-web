"use client";

// 14 Planejamento: o que já está na lista e o que pode acabar antes da próxima compra (incluir / agora não).

import Link from "next/link";
import { api, type PlanningSuggestion } from "@/lib/api";
import { capitalize, moneyRound, parseIso, weekdayPlain } from "@/lib/format";
import { useResource } from "@/lib/useResource";
import { useKiosk } from "../shell/context";
import { EmptyState, Eyebrow, Icon, OriginDot, originOf } from "../ui";

export function PlanejarView() {
  const k = useKiosk();
  const plan = useResource((s) => api.getPlanning(s), 60_000);
  const list = useResource((s) => api.getShoppingList(s), 30_000);
  const p = plan.data;

  const reasons = new Map((list.data ?? []).map((i) => [i.id, i.reason]));
  const onList = p?.onList ?? [];
  const sug = p?.suggestions ?? [];
  const pending = sug.filter((s) => !s.decision);

  async function decide(s: PlanningSuggestion, decision: PlanningSuggestion["decision"]) {
    plan.mutate((d) => d && { ...d, suggestions: d.suggestions?.map((x) => (x.genericProductId === s.genericProductId ? { ...x, decision } : x)) });
    await k.write(() => api.decidePlanning(s.genericProductId, decision));
  }

  async function includeAll() {
    plan.mutate((d) => d && { ...d, suggestions: d.suggestions?.map((x) => (x.decision ? x : { ...x, decision: "include" })) });
    await k.write(() => api.includeAllPlanning());
  }

  const weekday = p?.nextTrip ? weekdayPlain(parseIso(p.nextTrip).getDay()) : null;
  const est = p?.estimatedSpendCents;
  const when = p?.daysUntil == null ? null : p.daysUntil === 0 ? "hoje" : p.daysUntil === 1 ? "amanhã" : `daqui a ${p.daysUntil} dias`;

  return (
    <div className="page">
      <div className="page-head page-head-end">
        <div>
          <Eyebrow>Próxima compra</Eyebrow>
          <h1 className="plan-title">{p ? (p.nextTripLabel ?? (p.nextTrip ? capitalize(weekday!) : "Sem data marcada")) : plan.error ? "Não consegui carregar" : "Carregando…"}</h1>
          {p?.nextTrip && (
            <div className="page-sub">
              {[when, est ? `gasto estimado entre ${moneyRound(est.min)} e ${moneyRound(est.max)}` : null].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <div className="legend">
          <span>
            <OriginDot origin="falt" size={14} />
            Faltando
          </span>
          <span>
            <OriginDot origin="prev" size={14} />
            Previsto
          </span>
          <span>
            <i className="legend-sug" />
            Sugestão
          </span>
          <span>
            <Icon name="check" size={22} className="tone-ok" />
            Sua decisão
          </span>
        </div>
      </div>

      {p && !p.nextTrip ? (
        <EmptyState
          icon="event_busy"
          title="Sem dia de compra definido"
          actions={
            <Link href="/configuracoes" className="btn btn-primary btn-md">
              Escolher dias de mercado
            </Link>
          }
        >
          Diga em Configurações em que dias vocês costumam ir ao mercado. Assim eu sugiro o que comprar antes.
        </EmptyState>
      ) : (
        <div className="page-body plan-grid">
          <section className="card plan-list">
            <div className="row-between plan-list-head">
              <Eyebrow>Já na lista</Eyebrow>
              <div className="plan-count num">{onList.length}</div>
            </div>
            <div className="plan-rows">
              {p && onList.length === 0 && <div className="tone-muted plan-empty">Nada na lista por enquanto.</div>}
              {onList.map((it) => (
                <div key={it.listItemId} className="plan-row">
                  <OriginDot origin={originOf(reasons.get(it.listItemId) ?? "manual")} size={14} />
                  <div className="plan-name">{capitalize(it.name)}</div>
                  <div className="plan-qty">{it.quantityLabel}</div>
                </div>
              ))}
            </div>
          </section>

          <div className="plan-sug">
            <Eyebrow className="plan-sug-title">{weekday ? `Podem acabar antes de ${weekday}` : "Podem acabar antes da compra"}</Eyebrow>
            {p && sug.length === 0 && <div className="tone-muted plan-empty">Nada deve acabar antes da compra. Se algo mudar, aparece aqui.</div>}
            {sug.map((s) =>
              s.decision === "include" ? (
                <div key={s.genericProductId} className="sug sug-in">
                  <Icon name="check" className="tone-ok" />
                  <div className="sug-text">
                    <div className="sug-name">{capitalize(s.name)}</div>
                    <div className="sug-phrase tone-ok">incluído por você</div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => decide(s, null)}>
                    Desfazer
                  </button>
                </div>
              ) : s.decision === "skip" ? (
                <div key={s.genericProductId} className="sug sug-out">
                  <div className="sug-out-text">{capitalize(s.name)} · fica para depois</div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => decide(s, null)}>
                    Desfazer
                  </button>
                </div>
              ) : (
                <div key={s.genericProductId} className="sug sug-open">
                  <div className="sug-text">
                    <div className="sug-name">{capitalize(s.name)}</div>
                    <div className="sug-phrase">
                      {[s.suggestedQuantity?.label, s.reason === "missing" ? "acabou e ainda não está na lista" : s.windowLabel].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => decide(s, "skip")}>
                    Agora não
                  </button>
                  <button type="button" className="btn btn-outline-light btn-sm" onClick={() => decide(s, "include")}>
                    Incluir
                  </button>
                </div>
              ),
            )}
            <div className="flex-1" />
            {pending.length > 0 && (
              <div className="plan-all">
                <div className="plan-all-text">
                  Sugestão: incluir {pending.length === 1 ? capitalize(pending[0].name).toLowerCase() : `${pending.length} itens`} nesta compra.
                </div>
                <button type="button" className="btn btn-primary" onClick={includeAll}>
                  Incluir todos
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
