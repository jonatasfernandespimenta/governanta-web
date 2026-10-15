"use client";

// 06 Próximos a acabar: faixas de estimativa num eixo de hoje a +12 dias, com a próxima compra marcada.

import Link from "next/link";
import type { CSSProperties } from "react";
import { api } from "@/lib/api";
import { axisPct, band, dayGroup, estimateLabel, forecastPhrase, HORIZON_DAYS, isLearning, learningReason, windowDays } from "@/lib/forecast";
import { capitalize, daysUntil, parseIso, WEEKDAYS_SHORT } from "@/lib/format";
import { useResource } from "@/lib/useResource";
import { useKiosk } from "../shell/context";
import { EmptyState, Eyebrow, Icon, OnListBadge } from "../ui";

export function PrevisoesView() {
  const k = useKiosk();
  const fc = useResource((s) => api.getForecast(s), 5 * 60_000);
  const list = useResource((s) => api.getShoppingList(s), 30_000);
  const plan = useResource((s) => api.getPlanning(s), 5 * 60_000);

  const onList = new Set((list.data ?? []).filter((i) => i.status === "open").map((i) => i.genericProductId));
  const all = fc.data ?? [];
  const preds = all.filter((f) => !isLearning(f)).sort((a, b) => (a.expectedDepletionAt ?? a.windowStart ?? "").localeCompare(b.expectedDepletionAt ?? b.windowStart ?? ""));
  const learning = all.filter(isLearning);

  const trip = plan.data?.nextTrip ?? null;
  const tripDays = trip ? daysUntil(trip) : null;
  const tripOnAxis = tripDays != null && tripDays >= 0 && tripDays <= HORIZON_DAYS;
  const axisStyle = { "--trip": `${tripOnAxis ? axisPct(tripDays) : 0}%` } as CSSProperties;

  async function add(id: string, name: string) {
    const item = await k.write(() => api.addListItem({ genericProductId: id }));
    if (item) k.toast(`${name} adicionado à lista`, { undo: () => api.removeListItem(item.id) });
  }

  const groups = preds.map(dayGroup);

  return (
    <div className="page">
      <div className="page-head page-head-end">
        <div>
          <h1 className="page-title">Próximos a acabar</h1>
          <div className="page-sub">Estimativas pelo ritmo de consumo da casa. Podem variar alguns dias.</div>
        </div>
        <div className="legend">
          <span>
            <Icon name="check" size={22} className="tone-ok" />
            Na lista
          </span>
          <span>
            <i className="dot dot-prev" style={{ "--d": 14 } as CSSProperties} />
            Ainda não adicionado
          </span>
          <span>
            <i className="dot dot-none" style={{ "--d": 14 } as CSSProperties} />
            Sem dados suficientes
          </span>
        </div>
      </div>

      {fc.data && all.length === 0 ? (
        <EmptyState icon="hourglass_empty" title="Ainda estou aprendendo o ritmo da casa">
          As previsões aparecem depois de 2 ou 3 compras. Escaneie as notas e marque o que acabou.
        </EmptyState>
      ) : (
        <div className={`page-scroll prev-body${tripOnAxis && axisPct(tripDays ?? 0) < 30 ? " near" : ""}`} style={axisStyle}>
          {preds.length > 0 && (
            <div className="prev-row prev-axis" aria-hidden>
              <div />
              <div />
              <div className="prev-axis-labels">
                <span>hoje</span>
                {tripOnAxis && trip && <span className="prev-axis-trip">{tripDays === 0 ? "hoje · compra" : `${WEEKDAYS_SHORT[parseIso(trip).getDay()]} · compra`}</span>}
                <span>+{HORIZON_DAYS} dias</span>
              </div>
              <div />
            </div>
          )}
          {preds.map((p, i) => {
            const w = windowDays(p)!;
            const group = groups[i];
            const showGroup = i === 0 || group !== groups[i - 1];
            const b = band(w);
            const name = capitalize(p.name);
            return (
              <div key={p.genericProductId} className={`prev-row prev-item${showGroup ? " prev-first" : ""}`}>
                <div className="prev-day">{showGroup ? group : ""}</div>
                <Link href={`/produto/${p.genericProductId}`} className="prev-text">
                  <div className="prev-name">
                    {name}
                    <Icon name="chevron_right" size={28} className="tone-subtle" />
                  </div>
                  <div className="prev-phrase">
                    {forecastPhrase(p)} · estimativa: {estimateLabel(w)}
                  </div>
                </Link>
                <div className="track" aria-label={`Janela estimada: ${estimateLabel(w)}`}>
                  <span className="track-base" />
                  <span className="track-band" style={{ left: b.left, width: b.width }} />
                  {tripOnAxis && <span className="track-trip" />}
                </div>
                <div className="prev-action">
                  {onList.has(p.genericProductId) ? (
                    <OnListBadge size="md">Na lista</OnListBadge>
                  ) : (
                    <button type="button" className="btn btn-dashed btn-sm btn-icon" onClick={() => add(p.genericProductId, name)}>
                      <Icon name="add" size={26} />
                      Adicionar
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {learning.length > 0 && (
            <>
              <Eyebrow className="prev-learning-title">Ainda aprendendo</Eyebrow>
              {learning.map((l) => (
                <div key={l.genericProductId} className="prev-row prev-learn">
                  <div />
                  <div>
                    <div className="prev-learn-name">{capitalize(l.name)}</div>
                    <div className="prev-learn-why">{learningReason(l)}</div>
                  </div>
                  <div className="track-dotted" />
                  <div />
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
