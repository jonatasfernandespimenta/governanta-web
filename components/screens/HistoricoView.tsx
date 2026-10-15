"use client";

// 10 Histórico (compras por mês) e 12 Gastos, como duas abas da mesma tela.

import Link from "next/link";
import { useState } from "react";
import { api, type FinanceSummary } from "@/lib/api";
import { capitalize, daysUntil, MONTHS, money, moneyRound, normalize, percent } from "@/lib/format";
import { useResource } from "@/lib/useResource";
import { Bars, EmptyState, Eyebrow, Icon } from "../ui";

const monthName = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1];

function HistHead({ tab, onSearch }: { tab: "compras" | "gastos"; onSearch?: () => void }) {
  return (
    <div className="page-head">
      <div className="hist-title">
        <h1 className="page-title">Histórico</h1>
        <nav className="seg" aria-label="Histórico">
          <Link href="/historico" className={tab === "compras" ? "on" : ""} aria-current={tab === "compras" ? "page" : undefined}>
            Compras
          </Link>
          <Link href="/historico/gastos" className={tab === "gastos" ? "on" : ""} aria-current={tab === "gastos" ? "page" : undefined}>
            Gastos
          </Link>
        </nav>
      </div>
      <div className="head-actions">
        {onSearch && (
          <button type="button" className="round-btn" aria-label="Buscar" onClick={onSearch}>
            <Icon name="search" />
          </button>
        )}
        <Link href="/escanear" className="btn btn-primary btn-icon">
          <Icon name="qr_code_scanner" size={28} />
          Escanear nota
        </Link>
      </div>
    </div>
  );
}

export function ComprasView() {
  const months = useResource((s) => api.getReceipts(s), 60_000);
  const [search, setSearch] = useState<string | null>(null);
  const q = normalize(search ?? "");
  const data = (months.data ?? [])
    .map((m) => ({ ...m, receipts: m.receipts.filter((r) => !q || normalize(r.merchantName ?? "compra manual").includes(q)) }))
    .filter((m) => m.receipts.length);

  return (
    <div className="page">
      <HistHead tab="compras" onSearch={() => setSearch((s) => (s == null ? "" : null))} />
      {search != null && (
        <div className="hist-search">
          <label className="search search-compact">
            <Icon name="search" className="tone-subtle" />
            <input autoFocus type="search" placeholder="Buscar mercado…" aria-label="Buscar mercado" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>
      )}
      {months.data && months.data.length === 0 ? (
        <EmptyState
          icon="receipt_long"
          title="Nenhuma compra registrada ainda"
          actions={
            <Link href="/escanear" className="btn btn-primary btn-md">
              Escanear nota
            </Link>
          }
        >
          Escaneie o QR Code da próxima nota. É assim que a Governanta aprende preços e o ritmo da casa.
        </EmptyState>
      ) : (
        <div className="page-scroll hist-body">
          {!months.data && <div className="tone-muted hist-loading">{months.error ? "Não consegui carregar o histórico." : "Carregando…"}</div>}
          {months.data && data.length === 0 && <div className="tone-muted hist-loading">Nenhuma compra com esse nome.</div>}
          {data.map((m) => (
            <section key={m.month} aria-label={monthName(m.month)}>
              <div className="hist-month">
                <Eyebrow>{monthName(m.month)}</Eyebrow>
                <div className="hist-month-sum num">
                  {m.count} {m.count === 1 ? "compra" : "compras"} · {money(m.totalCents)}
                </div>
              </div>
              {m.receipts.map((r) => {
                const day = r.issuedAt ? new Date(r.issuedAt) : null;
                const iso = r.issuedAt.slice(0, 10);
                return (
                  <Link key={r.id} href={`/compras/${r.id}`} className="hist-row">
                    <div>
                      <div className="hist-day num">{day ? String(day.getDate()).padStart(2, "0") : ""}</div>
                      <div className="hist-wd">
                        {monthName(m.month).slice(0, 3)} · {daysUntil(iso) === 0 ? "hoje" : r.weekdayLabel}
                      </div>
                    </div>
                    <div className="hist-main">
                      <div className="hist-merchant">{r.merchantName ?? "Compra manual"}</div>
                      <div className="hist-items">
                        {r.itemCount} {r.itemCount === 1 ? "item" : "itens"}
                        {r.status === "parsed" ? " · falta revisar" : ""}
                      </div>
                    </div>
                    <div className="hist-total num">{money(r.totalCents)}</div>
                    <Icon name="chevron_right" className="tone-subtle" />
                  </Link>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function GastosView() {
  const fin = useResource((s) => api.getFinance(s), 5 * 60_000);
  const f = fin.data;
  return (
    <div className="page">
      <HistHead tab="gastos" />
      {!f ? (
        <div className="center-body tone-muted">{fin.error ? "Não consegui carregar os gastos." : "Carregando…"}</div>
      ) : f.totalCents === 0 && f.prevMonthTotalCents === 0 ? (
        <EmptyState
          icon="payments"
          title="Ainda sem gastos registrados"
          actions={
            <Link href="/escanear" className="btn btn-primary btn-md">
              Escanear nota
            </Link>
          }
        >
          Os gastos aparecem aqui conforme você escaneia as notas das compras.
        </EmptyState>
      ) : (
        <Gastos f={f} />
      )}
    </div>
  );
}

function Gastos({ f }: { f: FinanceSummary }) {
  const month = monthName(f.month);
  const now = new Date();
  const current = f.month === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevIdx = (Number(f.month.slice(5, 7)) + 10) % 12;
  const prev = MONTHS[prevIdx];
  const maxCat = Math.max(1, ...f.byCategory.map((c) => c.totalCents));
  return (
    <div className="page-body gastos-grid">
      <section className="card gastos-total">
        <Eyebrow>
          {capitalize(month)}
          {current ? " · até hoje" : ""}
        </Eyebrow>
        <div className="gastos-big num">{money(f.totalCents)}</div>
        {f.changePct != null && (
          <div className="gastos-change">
            <Icon name={f.changePct >= 0 ? "arrow_upward" : "arrow_downward"} size={26} />
            {percent(Math.abs(f.changePct))} {f.changePct >= 0 ? "a mais" : "a menos"} que {prev}
          </div>
        )}
        <div className="gastos-prev num">
          {prev} inteiro: {money(f.prevMonthTotalCents)}
        </div>
        <div className="flex-1" />
        {f.byWeek.length > 0 && (
          <>
            <Eyebrow className="gastos-week-title">Por semana</Eyebrow>
            <Bars
              className="bars-weeks"
              bars={f.byWeek.map((w) => ({
                key: w.label,
                top: String(Math.round(w.totalCents / 100)),
                label: w.current ? "esta" : w.label,
                value: w.totalCents,
                current: w.current,
                hatched: w.current,
              }))}
            />
          </>
        )}
      </section>

      <section className="card gastos-cats">
        <Eyebrow className="gastos-cats-title">Onde mais gastamos</Eyebrow>
        {f.byCategory.map((c) => {
          const other = c.name === "Outros";
          return (
            <div key={c.name} className={`cat${other ? " cat-other" : ""}`}>
              <div className="row-between">
                <span>{c.name}</span>
                <span className="num">{moneyRound(c.totalCents)}</span>
              </div>
              <div className="cat-track">
                <div style={{ width: `${(c.totalCents / maxCat) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </section>

      <div className="gastos-side">
        <section className="card gastos-up">
          <Eyebrow>Maiores aumentos</Eyebrow>
          {f.topIncreases.length === 0 && <div className="tone-muted gastos-none">Nenhum aumento de preço neste mês.</div>}
          {f.topIncreases.map((t) => (
            <div key={t.name} className="up-row">
              <div>
                <div className="up-name">{t.name}</div>
                <div className="up-sub num">
                  {money(t.fromCents)} → {money(t.toCents)}
                  {t.unitLabel ? ` ${t.unitLabel}` : ""}
                </div>
              </div>
              <div className="up-pct num">+{Math.round(t.pct)}%</div>
            </div>
          ))}
        </section>
        <section className="card gastos-merchants">
          <Eyebrow className="gastos-merchants-title">Mercados</Eyebrow>
          {f.byMerchant.map((m, i) => (
            <div key={m.name} className={`row-between merchant-sum${i >= 3 ? " tone-muted" : ""}`}>
              <span>{m.name}</span>
              <span className="num">{moneyRound(m.totalCents)}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
