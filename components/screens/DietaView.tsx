"use client";

// Dieta: sem plano, colar o texto da nutricionista; com plano ativo, as refeições de hoje, "não segui",
// o diário ("Registrar o que comi") e o que comprar até a próxima ida pela dieta.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError, type DietPlan, type DietShopping, type Member } from "@/lib/api";
import { chosenOptions, isDietDay, listQuantity, slotCounts, todayException, toBuyLabel, weekdaysLabel } from "@/lib/diet";
import { capitalize, dayMonth, dietAmount, localIso, parseIso, relativeDay, weekdayPlain } from "@/lib/format";
import { useResource } from "@/lib/useResource";
import { useKiosk } from "../shell/context";
import { BackButton, Eyebrow, Icon, OnListBadge, Skeleton } from "../ui";
import { DiarySheet } from "./DiarySheet";

export function DietaView() {
  const plans = useResource((s) => api.getDiets(s), 60_000);
  const members = useResource((s) => api.getMembers(s), 10 * 60_000);
  const [idx, setIdx] = useState(0);

  const all = plans.data ?? [];
  const active = all.filter((p) => p.active);
  const drafts = all.filter((p) => !p.active);
  const plan = active[Math.min(idx, active.length - 1)];

  return (
    <div className="page">
      <div className="page-head page-head-start">
        <BackButton fallback="/" />
        <div className="head-grow">
          <h1 className="page-title page-title-detail">Dieta</h1>
          {plan && (
            <div className="page-sub-subtle">
              {[plan.memberName, weekdaysLabel(plan.dietWeekdays), `seguida em ${Math.round(plan.dietDayFraction * 100)}% dos dias`].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        {active.length > 1 && (
          <div className="seg" role="tablist" aria-label="Plano">
            {active.map((p, i) => (
              <button key={p.id} type="button" role="tab" aria-selected={p === plan} className={p === plan ? "on" : ""} onClick={() => setIdx(i)}>
                {p.memberName ?? p.name}
              </button>
            ))}
          </div>
        )}
        {plan && <ActiveActions plan={plan} />}
      </div>

      {!plans.data ? (
        <div className="page-body dieta-grid">
          <Skeleton label={plans.error ? "Não consegui carregar a dieta." : "Carregando a dieta…"} widths={[64, 52, 58, 40]} />
          <Skeleton label=" " widths={[70, 50]} />
        </div>
      ) : plan ? (
        <ActivePlan key={plan.id} plan={plan} reload={plans.reload} />
      ) : (
        <ImportPlan drafts={drafts} members={members.data ?? []} onDeleted={(id) => plans.mutate((d) => d?.filter((p) => p.id !== id))} />
      )}
    </div>
  );
}

// ---------- Sem plano ativo: colar o texto ----------

function importError(err: unknown): string {
  if (err instanceof ApiError && err.code === "nothing_parsed") return "Não encontrei refeições nesse texto. Cole o plano inteiro, com as linhas que começam com 🔸 e 🔹.";
  if (err instanceof ApiError && err.status < 500) return "A Governanta não aceitou esse texto. Confira se colou o plano inteiro.";
  return "Não consegui falar com a Governanta agora. Tente de novo em instantes.";
}

function ImportPlan({ drafts, members, onDeleted }: { drafts: DietPlan[]; members: Member[]; onDeleted: (id: string) => void }) {
  const k = useKiosk();
  const router = useRouter();
  const [text, setText] = useState("");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function read() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.importDiet({ text: text.trim(), memberId });
      if (r.warnings.length) k.toast(`Plano lido · ${r.warnings.length} ${r.warnings.length === 1 ? "linha ficou" : "linhas ficaram"} de fora`);
      router.push(`/dieta/${r.planId}/revisar`);
    } catch (err) {
      setError(importError(err));
      setBusy(false);
    }
  }

  function remove(p: DietPlan) {
    onDeleted(p.id);
    k.toast(`${p.name} apagado`, { commit: () => api.deleteDiet(p.id) });
  }

  return (
    <div className="page-body dieta-grid">
      <section className="card dieta-paste">
        <Eyebrow>Cole o plano da nutricionista</Eyebrow>
        <textarea
          className="dieta-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"1️⃣ Refeição - Café da manhã\n🔸3 ovos / 30g whey + 30g pasta de amendoim\n🔹6g Creatina"}
          aria-label="Texto do plano"
          spellCheck={false}
        />
        {members.length > 0 && (
          <div className="dieta-member">
            <span className="tone-muted">Plano de</span>
            <div className="seg">
              <button type="button" className={memberId == null ? "on" : ""} onClick={() => setMemberId(null)}>
                Casa
              </button>
              {members.map((m) => (
                <button key={m.id} type="button" className={memberId === m.id ? "on" : ""} onClick={() => setMemberId(m.id)}>
                  {m.displayName}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && (
          <div className="info-box">
            <Icon name="error" size={28} className="tone-bad" />
            {error}
          </div>
        )}
        <div className="row-gap row-end">
          <button type="button" className="btn btn-primary btn-lg" disabled={!text.trim() || busy} onClick={read}>
            {busy ? "Lendo…" : "Ler plano"}
          </button>
        </div>
      </section>

      <div className="dieta-side">
        {drafts.map((p) => (
          <section key={p.id} className="card dieta-draft">
            <Eyebrow>Em revisão</Eyebrow>
            <div className="dieta-draft-name">{p.name}</div>
            <div className="dieta-draft-sub">
              importado em {dayMonth(localIso(p.createdAt))} · {p.meals.length} refeições
              {p.unlinkedCount ? ` · ${p.unlinkedCount} sem produto` : ""}
            </div>
            <div className="row-gap row-end">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(p)}>
                Apagar
              </button>
              <Link href={`/dieta/${p.id}/revisar`} className="btn btn-outline-light btn-sm">
                Continuar revisão
              </Link>
            </div>
          </section>
        ))}
        <section className="card dieta-how">
          <Eyebrow>Como funciona</Eyebrow>
          <ol className="dieta-steps">
            <li>Eu leio as refeições, as opções (“/”) e os suplementos.</li>
            <li>Você liga cada alimento a um produto da casa e diz o que costuma comer.</li>
            <li>Com o plano ativo, a dieta mostra quanto comprar até a próxima ida e quando cada item deve acabar.</li>
          </ol>
        </section>
      </div>
    </div>
  );
}

// ---------- Plano ativo ----------

function ActiveActions({ plan }: { plan: DietPlan }) {
  const [diary, setDiary] = useState(false);
  return (
    <div className="head-actions">
      <Link href={`/dieta/${plan.id}/revisar`} className="btn btn-outline">
        Editar plano
      </Link>
      <button type="button" className="btn btn-primary btn-icon" onClick={() => setDiary(true)}>
        <Icon name="restaurant" size={26} />
        Registrar o que comi
      </button>
      {diary && <DiarySheet plan={plan} onClose={() => setDiary(false)} />}
    </div>
  );
}

function ActivePlan({ plan, reload }: { plan: DietPlan; reload: () => void }) {
  const k = useKiosk();
  const shop = useResource((s) => api.getDietShopping(s), 5 * 60_000);
  const list = useResource((s) => api.getShoppingList(s), 30_000);
  const [diaryMeal, setDiaryMeal] = useState<string | null>(null);

  const now = new Date();
  const dietDay = isDietDay(plan, now);
  const exc = todayException(plan, now);
  const onList = new Set((list.data ?? []).filter((i) => i.status === "open").map((i) => i.genericProductId));

  async function setException(kind: "skipped" | "partial") {
    const date = localIso(now);
    const ok = await k.write(() => api.addDietException(plan.id, { date, kind, note: null }));
    if (ok) {
      reload();
      k.toast(kind === "skipped" ? "Anotado: hoje não segui a dieta" : "Anotado: hoje segui em parte", { undo: () => api.removeDietException(plan.id, date) });
    }
  }

  async function clearException() {
    if (!exc) return;
    const removed = await k.write(() => api.removeDietException(plan.id, exc.date).then(() => true));
    if (removed) reload();
  }

  return (
    <div className="page-body dieta-grid">
      <section className="card dieta-today" aria-label="Hoje">
        <div className="row-between">
          <Eyebrow>Hoje · {weekdayPlain(now.getDay())}</Eyebrow>
          {exc && <span className="tag tag-warn">{exc.kind === "skipped" ? "não segui hoje" : "segui em parte"}</span>}
        </div>
        {!dietDay && <div className="dieta-note">Hoje não é dia de dieta. As refeições ficam aqui para consulta.</div>}
        <div className="dieta-meals">
          {plan.meals.map((m) => (
            <div key={m.id} className="dieta-meal">
              <div className="dieta-meal-head">
                <div className="dieta-meal-name">{m.name}</div>
                <button type="button" className="link-muted" aria-label={`Registrar o que comi no ${m.name.toLowerCase()}`} onClick={() => setDiaryMeal(m.id)}>
                  Registrar
                </button>
              </div>
              <ul className="dieta-meal-items">
                {m.slots.filter(slotCounts).map((s) => {
                  const opts = chosenOptions(s);
                  return (
                    <li key={s.id} className={s.kind === "supplement" ? "supp" : undefined}>
                      {opts.map((o) => o.label).join(" ou ")}
                      {opts.length > 1 && <span className="tone-subtle"> · alterna</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="dieta-exc">
          {exc ? (
            <>
              <span className="tone-muted">{exc.kind === "skipped" ? "Hoje não conta na dieta." : "Hoje conta como meio dia de dieta."}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearException}>
                Desfazer
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setException("skipped")}>
                Hoje não segui
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setException("partial")}>
                Segui em parte
              </button>
            </>
          )}
        </div>
      </section>

      <ShoppingCard shop={shop.data} failed={!!shop.error && !shop.data} onList={onList} />

      {diaryMeal && <DiarySheet plan={plan} mealId={diaryMeal} onClose={() => setDiaryMeal(null)} />}
    </div>
  );
}

function ShoppingCard({ shop, failed, onList }: { shop: DietShopping | undefined; failed: boolean; onList: Set<string | null> }) {
  const k = useKiosk();
  const items = (shop?.items ?? []).slice().sort((a, b) => Number(b.toBuy > 0) - Number(a.toBuy > 0) || a.name.localeCompare(b.name));
  const missing = items.filter((i) => i.toBuy > 0 && !onList.has(i.genericProductId));

  async function add(it: DietShopping["items"][number]) {
    const item = await k.write(() => api.addListItem({ genericProductId: it.genericProductId, ...listQuantity(it) }));
    if (item) k.toast(`${capitalize(it.name)} adicionado à lista`, { undo: () => api.removeListItem(item.id) });
  }

  async function addAll() {
    const added = await k.write(async () => {
      const out = [];
      for (const it of missing) out.push(await api.addListItem({ genericProductId: it.genericProductId, ...listQuantity(it) }));
      return out;
    });
    if (added) k.toast(`${added.length} ${added.length === 1 ? "item adicionado" : "itens adicionados"} à lista`, { undo: () => Promise.all(added.map((i) => api.removeListItem(i.id))) });
  }

  return (
    <section className="card dieta-shop" aria-label="Para comprar">
      <div className="row-between">
        <Eyebrow>{shop ? `Para comprar até ${weekdayPlain(parseIso(shop.until).getDay())}, ${dayMonth(shop.until)}` : "Para comprar"}</Eyebrow>
        {missing.length > 1 && (
          <button type="button" className="btn btn-outline-light btn-sm" onClick={addAll}>
            Pôr tudo na lista
          </button>
        )}
      </div>
      {shop && (
        <div className="dieta-note">
          Na ida de {relativeDay(shop.nextTrip)} · cobre {shop.days} dias de dieta
        </div>
      )}
      {failed && <div className="dieta-note">Não consegui calcular as compras agora.</div>}
      {shop && items.length === 0 && <div className="dieta-note">Ligue os alimentos a produtos para eu calcular o que comprar.</div>}
      <div className="dieta-shop-rows">
        {items.map((it) => (
          <div key={it.genericProductId} className={`dieta-shop-row${it.toBuy > 0 ? "" : " done"}`}>
            <div className="dieta-shop-text">
              <div className="dieta-shop-name">{capitalize(it.name)}</div>
              <div className="dieta-shop-sub">
                {it.hint ??
                  [`${dietAmount(it.perDay, it.unit)}${it.unit === "un" ? " un." : ""} por dia`, it.inStock ? `em casa ${it.unit === "un" ? `${Math.floor(it.inStock)} un.` : dietAmount(it.inStock, it.unit)}` : null]
                    .filter(Boolean)
                    .join(" · ")}
              </div>
            </div>
            {it.toBuy > 0 ? (
              <>
                <div className="dieta-shop-qty num">{toBuyLabel(it)}</div>
                {onList.has(it.genericProductId) ? (
                  <OnListBadge />
                ) : (
                  <button type="button" className="add-circle" aria-label={`Pôr ${it.name} na lista`} onClick={() => add(it)}>
                    <Icon name="add" />
                  </button>
                )}
              </>
            ) : (
              <div className="dieta-shop-qty tone-subtle">tem em casa</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
