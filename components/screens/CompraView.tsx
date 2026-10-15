"use client";

// 11 Detalhe da compra: total, itens por lugar da casa e quantos itens da lista ela atendeu.

import { useState } from "react";
import { api } from "@/lib/api";
import { capitalize, clock, longDate, money } from "@/lib/format";
import { useResource } from "@/lib/useResource";
import { BackButton, Eyebrow } from "../ui";

function fullDate(iso: string) {
  const d = new Date(iso);
  const [wd, rest] = longDate(d).split(", ");
  return `${capitalize(wd.replace("-feira", ""))}, ${rest} de ${d.getFullYear()} · ${clock(d)}`;
}

export function CompraView({ id }: { id: string }) {
  const detail = useResource((s) => api.getReceiptDetail(id, s), 10 * 60_000);
  const [showKey, setShowKey] = useState(false);
  const d = detail.data;
  const r = d?.receipt;
  const manual = r ? r.merchantName == null : false;

  return (
    <div className="page">
      <div className="page-head page-head-start">
        <BackButton fallback="/historico" />
        <div className="head-grow">
          <h1 className="page-title page-title-detail">{r ? (r.merchantName ?? "Compra manual") : detail.error ? "Compra não encontrada" : "Carregando…"}</h1>
          {r && (
            <div className="page-sub page-sub-subtle">
              {fullDate(r.issuedAt)}
              {manual ? "" : " · NFC-e"}
            </div>
          )}
        </div>
      </div>
      {d && r && (
        <div className="page-body compra-grid">
          <section className="card compra-summary">
            <div>
              <Eyebrow>Total</Eyebrow>
              <div className="compra-total num">{money(r.totalCents)}</div>
            </div>
            <div>
              <Eyebrow>Produtos</Eyebrow>
              <div className="compra-count">
                {r.itemCount} {r.itemCount === 1 ? "item" : "itens"}
              </div>
            </div>
            <div>
              <Eyebrow>Da lista</Eyebrow>
              <div className="compra-list">
                {d.listItemsServed === 0 ? "nenhum item da lista" : `${d.listItemsServed} ${d.listItemsServed === 1 ? "item atendido" : "itens atendidos"}`}
              </div>
            </div>
            <div className="flex-1" />
            {!manual && r.accessKey && (
              <>
                {showKey && <div className="compra-key mono">{r.accessKey.replace(/(\d{4})(?=\d)/g, "$1 ")}</div>}
                <button type="button" className="compra-btn" onClick={() => setShowKey((v) => !v)}>
                  {showKey ? "Esconder chave de acesso" : "Ver nota original"}
                </button>
              </>
            )}
          </section>
          <div className="compra-items">
            {d.groups.map((g) => (
              <section key={g.location} aria-label={g.location}>
                <Eyebrow className="compra-group">{g.location}</Eyebrow>
                {g.items.map((it, i) => {
                  const showUnit = it.unitPriceCents !== it.totalCents;
                  return (
                    <div key={`${it.name}-${i}`} className="compra-item">
                      <span className="compra-name">
                        {it.name}
                        {it.isNew && <span className="tag tag-dashed tag-sm">novo</span>}
                      </span>
                      <span className="compra-qty num">
                        {it.quantityLabel}
                        {showUnit ? ` × ${money(it.unitPriceCents)}` : ""}
                      </span>
                      <span className="compra-price num">{money(it.totalCents)}</span>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
