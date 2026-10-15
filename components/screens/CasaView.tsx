"use client";

// 01 Casa: lista, o que acaba em breve, próxima compra, as quatro ações rápidas e atalhos (Perguntar, Despensa, Dieta).

import Link from "next/link";
import { api, type ShoppingListItem } from "@/lib/api";
import { forecastPhrase, isLearning } from "@/lib/forecast";
import { capitalize, clock, dayMonth, daysUntil, longDate, parseIso, qtyLabel, weekdayPlain } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { useResource } from "@/lib/useResource";
import { useKiosk } from "../shell/context";
import { Eyebrow, Icon, OnListBadge, OriginDot, originOf, Skeleton } from "../ui";

const HOME_ROWS = 4;

function greeting(d: Date) {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

export function CasaView() {
  const k = useKiosk();
  const now = useNow();
  const list = useResource((s) => api.getShoppingList(s), 20_000);
  const fc = useResource((s) => api.getForecast(s), 5 * 60_000);
  const plan = useResource((s) => api.getPlanning(s), 5 * 60_000);

  const open = (list.data ?? []).filter((i) => i.status === "open");
  const onList = new Set(open.map((i) => i.genericProductId));
  const preds = (fc.data ?? [])
    .filter((f) => !isLearning(f))
    .sort((a, b) => (a.windowStart ?? "").localeCompare(b.windowStart ?? ""))
    .slice(0, 3);
  const pending = (plan.data?.suggestions ?? []).filter((s) => !s.decision).length;
  const trip = plan.data?.nextTrip ?? null;

  async function addPred(id: string, name: string) {
    const item = await k.write(() => api.addListItem({ genericProductId: id }));
    if (item) k.toast(`${name} adicionado à lista`, { undo: () => api.removeListItem(item.id) });
  }

  return (
    <div className="page casa">
      {k.offline && (
        <div className="offline-banner">
          <Icon name="cloud_off" size={26} />
          Sem internet. Tudo continua salvo neste tablet e sincroniza quando a conexão voltar.
        </div>
      )}

      <header className="casa-head">
        <div>
          <h1 className="casa-hello">{now ? greeting(now) : " "}</h1>
          <div className="casa-date">{now ? longDate(now) : " "}</div>
        </div>
        <div className="casa-tools">
          <Link href="/perguntar" className="btn btn-outline casa-tool">
            <Icon name="forum" size={28} />
            Perguntar
          </Link>
          <Link href="/despensa" className="btn btn-outline casa-tool">
            <Icon name="kitchen" size={28} />
            Despensa
          </Link>
          <Link href="/dieta" className="btn btn-outline casa-tool casa-tool-extra">
            <Icon name="nutrition" size={28} />
            Dieta
          </Link>
          <div className="casa-clock num">{now ? clock(now) : ""}</div>
          <Link href="/configuracoes" className="round-btn" aria-label="Configurações">
            <Icon name="settings" />
          </Link>
        </div>
      </header>

      {!list.data && !list.error ? (
        <div className="casa-grid">
          <Skeleton label="Carregando a lista…" widths={[62, 48, 55, 40]} />
          <Skeleton label="Calculando previsões…" widths={[70, 58]} />
        </div>
      ) : (
        <div className="casa-grid">
          <section className="card casa-list" aria-label="Lista de compras">
            <div className="casa-list-head">
              <Eyebrow>Lista de compras</Eyebrow>
              <div className="big-count num">{open.length}</div>
            </div>
            {open.length === 0 ? (
              <div className="casa-list-empty">
                <div className="casa-empty-title">Nada na lista por enquanto.</div>
                <div className="casa-empty-text">Quando algo acabar, diga “acabou o café” ou toque em Acabou algo.</div>
              </div>
            ) : (
              <div className="casa-rows">
                {open.slice(0, HOME_ROWS).map((it: ShoppingListItem) => (
                  <div key={it.id} className="casa-row">
                    <OriginDot origin={originOf(it.reason)} />
                    <div className="casa-row-name">{capitalize(it.name)}</div>
                    <div className="casa-row-qty num">{qtyLabel(it.quantity, it.unit)}</div>
                  </div>
                ))}
              </div>
            )}
            {open.length > HOME_ROWS && <div className="casa-more">e mais {open.length - HOME_ROWS}</div>}
            <div className="flex-1" />
            <Link href="/lista" className="casa-open">
              Abrir lista
              <Icon name="arrow_forward" />
            </Link>
          </section>

          <div className="casa-side">
            <section className="card casa-preds" aria-label="Acaba em breve">
              <div className="casa-preds-head">
                <Eyebrow>Acaba em breve</Eyebrow>
                <Link href="/previsoes" className="link-muted">
                  Ver todos
                </Link>
              </div>
              {fc.data && preds.length === 0 && <div className="casa-learning">Ainda estou aprendendo o ritmo da casa. As previsões aparecem depois de 2 ou 3 compras.</div>}
              {preds.map((p) => (
                <div key={p.genericProductId} className="casa-pred">
                  <Link href={`/produto/${p.genericProductId}`} className="casa-pred-text">
                    <div className="casa-pred-name">{capitalize(p.name)}</div>
                    <div className="casa-pred-phrase">{forecastPhrase(p)}</div>
                  </Link>
                  {onList.has(p.genericProductId) ? (
                    <OnListBadge />
                  ) : (
                    <button type="button" className="add-circle" aria-label={`Adicionar ${p.name} à lista`} onClick={() => addPred(p.genericProductId, capitalize(p.name))}>
                      <Icon name="add" />
                    </button>
                  )}
                </div>
              ))}
            </section>

            <Link href="/planejar" className="card casa-trip">
              <div>
                <Eyebrow>Próxima compra</Eyebrow>
                {!plan.data ? (
                  <div className="sk-bar casa-trip-sk" />
                ) : trip ? (
                  <>
                    <div className="casa-trip-day">{daysUntil(trip) === 0 ? "Hoje" : capitalize(weekdayPlain(parseIso(trip).getDay()))}</div>
                    <div className="casa-trip-sub">
                      {dayMonth(trip)} · {open.length} na lista{pending ? ` · ${pending} ${pending === 1 ? "sugestão" : "sugestões"}` : ""}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="casa-trip-day">Sem data</div>
                    <div className="casa-trip-sub">Escolha os dias de mercado em Configurações.</div>
                  </>
                )}
              </div>
              <Icon name="chevron_right" size={34} className="tone-muted" />
            </Link>
          </div>
        </div>
      )}

      <div className="quick">
        <button type="button" onClick={() => k.openSheet("usei")}>
          <Icon name="restaurant" size={32} />
          Usei algo
        </button>
        <button type="button" onClick={() => k.openSheet("acabou")}>
          <Icon name="do_not_disturb_on" size={32} />
          Acabou algo
        </button>
        <button type="button" onClick={() => k.openSheet("add")}>
          <Icon name="add" size={32} />
          Adicionar item
        </button>
        <Link href="/escanear">
          <Icon name="qr_code_scanner" size={32} />
          Escanear nota
        </Link>
      </div>
    </div>
  );
}
