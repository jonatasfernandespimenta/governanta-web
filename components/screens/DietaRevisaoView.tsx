"use client";

// Revisão da dieta importada: (A) ligar cada alimento a um produto da casa, (B) o que você costuma comer
// em cada refeição, (C) dias de dieta; e "Ativar plano". Ao lado, quanto a dieta consome por dia, ao vivo.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, type DietLink, type DietLinkInput, type DietPlan, type DietSlot } from "@/lib/api";
import { perDayLabel, perUnitLabel, weekdaysLabel } from "@/lib/diet";
import { capitalize, dietAmount, WEEKDAYS_SHORT } from "@/lib/format";
import { useResource } from "@/lib/useResource";
import { ProductSheet, type PickedProduct } from "../shell/ProductSheet";
import { useKiosk } from "../shell/context";
import { BackButton, Eyebrow, Icon, Toggle } from "../ui";

type Step = "links" | "choices" | "days";
const STEPS: { key: Step; label: string; title: string }[] = [
  { key: "links", label: "1 · Alimentos", title: "Ligar alimentos aos produtos" },
  { key: "choices", label: "2 · Escolhas", title: "O que você costuma comer" },
  { key: "days", label: "3 · Dias", title: "Dias de dieta" },
];

export function DietaRevisaoView({ id }: { id: string }) {
  const k = useKiosk();
  const router = useRouter();
  const res = useResource((s) => api.getDiet(id, s), 10 * 60_000);
  const rates = useResource((s) => api.getDietRates(id, s), 10 * 60_000);
  const [step, setStep] = useState<Step>("links");
  const [saving, setSaving] = useState(false);
  const plan = res.data;

  if (!plan) {
    return (
      <div className="page">
        <div className="page-head page-head-start">
          <BackButton fallback="/dieta" />
          <h1 className="page-title page-title-detail">{res.error ? "Plano não encontrado" : "Carregando o plano…"}</h1>
        </div>
      </div>
    );
  }

  /** Aplica a resposta da API (o plano inteiro) e recalcula o "Por dia". */
  function apply(next: DietPlan | undefined) {
    if (!next) return;
    res.mutate(() => next);
    void rates.reload();
  }

  async function saveLinks(links: DietLinkInput[]) {
    apply(await k.write(() => api.saveDietLinks(id, links)));
  }

  async function activate() {
    setSaving(true);
    const p = await k.write(() => api.updateDiet(id, { active: true }));
    setSaving(false);
    if (!p) return;
    k.toast("Dieta ativada", { undo: () => api.updateDiet(id, { active: false }) });
    router.push("/dieta");
  }

  const counted = plan.links.filter((l) => !l.adLibitumOnly);
  const pending = counted.filter((l) => !l.genericProductId).length;
  const openSuggestions = counted.filter((l) => !l.genericProductId && l.suggestion);
  const hinted = new Set((rates.data?.items ?? []).filter((r) => r.hint).map((r) => r.genericProductId));
  const idx = STEPS.findIndex((s) => s.key === step);
  const cur = STEPS[idx];

  return (
    <div className="page">
      <div className="page-head page-head-start">
        <BackButton fallback="/dieta" />
        <div className="head-grow">
          <h1 className="page-title page-title-detail">Revisar dieta</h1>
          <div className="page-sub-subtle">
            {plan.name} · {plan.meals.length} refeições{plan.active ? " · ativa" : ""}
          </div>
        </div>
        <div className="head-actions">
          <div className="seg dieta-steps-seg" role="tablist" aria-label="Etapas">
            {STEPS.map((s) => (
              <button key={s.key} type="button" role="tab" aria-selected={s.key === step} className={s.key === step ? "on" : ""} onClick={() => setStep(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
          {plan.active ? (
            <Link href="/dieta" className="btn btn-primary">
              Concluir
            </Link>
          ) : (
            <button type="button" className="btn btn-primary" disabled={saving} onClick={activate}>
              {saving ? "Ativando…" : "Ativar plano"}
            </button>
          )}
        </div>
      </div>

      <div className="page-body dieta-review">
        <section className="card dieta-main">
          <div className="row-between dieta-step-head">
            <h2 className="dieta-step-title">{cur.title}</h2>
            {step === "links" &&
              (openSuggestions.length > 1 ? (
                <button type="button" className="btn btn-outline-light btn-sm" onClick={() => saveLinks(openSuggestions.map((l) => suggestionInput(l, l.gramsPerUnit)!))}>
                  Confirmar {openSuggestions.length} sugestões
                </button>
              ) : (
                <span className="tone-muted dieta-step-count">{pending ? `${pending} sem produto` : "todos ligados"}</span>
              ))}
            {step === "days" && <span className="tone-muted dieta-step-count">{weekdaysLabel(plan.dietWeekdays)}</span>}
          </div>

          <div className="dieta-step-body" key={step}>
            {step === "links" && <LinksStep plan={plan} hinted={hinted} onSave={saveLinks} />}
            {step === "choices" && <ChoicesStep plan={plan} onChange={(p) => res.mutate(() => p)} onSaved={apply} />}
            {step === "days" && <DaysStep plan={plan} onSaved={apply} />}
            <div className="row-gap row-end dieta-step-nav">
              {idx > 0 && (
                <button type="button" className="btn btn-outline" onClick={() => setStep(STEPS[idx - 1].key)}>
                  Voltar
                </button>
              )}
              {idx < STEPS.length - 1 ? (
                <button type="button" className="btn btn-outline-light" onClick={() => setStep(STEPS[idx + 1].key)}>
                  Próximo: {STEPS[idx + 1].label.split("· ")[1]}
                </button>
              ) : plan.active ? (
                <Link href="/dieta" className="btn btn-primary">
                  Concluir
                </Link>
              ) : (
                <button type="button" className="btn btn-primary" disabled={saving} onClick={activate}>
                  Ativar plano
                </button>
              )}
            </div>
          </div>
        </section>

        <RatesPanel plan={plan} rates={rates.data} onFix={() => setStep("links")} />
      </div>
    </div>
  );
}

// ---------- Painel "Por dia" ----------

function RatesPanel({ plan, rates, onFix }: { plan: DietPlan; rates: Awaited<ReturnType<typeof api.getDietRates>> | undefined; onFix: () => void }) {
  const items = (rates?.items ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  return (
    <aside className="card dieta-rates" aria-label="Consumo por dia">
      <Eyebrow>Por dia</Eyebrow>
      <div className="dieta-rates-sub">
        {Math.round(plan.dietDayFraction * 100) < 100 ? `já descontados os dias fora da dieta (${Math.round(plan.dietDayFraction * 100)}%)` : "nos dias de dieta"}
      </div>
      <div className="dieta-rates-rows">
        {!rates && <div className="sk-bar" />}
        {rates && items.length === 0 && <div className="dieta-note">Ligue os alimentos a produtos e o consumo aparece aqui.</div>}
        {items.map((r) => (
          <div key={r.genericProductId} className="dieta-rate">
            <div className="dieta-rate-line">
              <span>{capitalize(r.name)}</span>
              <span className="num">
                {dietAmount(r.perDay, r.unit)}
                {r.unit === "un" ? " un." : ""}
              </span>
            </div>
            {r.hint && (
              <button type="button" className="dieta-rate-hint" onClick={onFix}>
                <Icon name="info" size={22} />
                {r.hint}
              </button>
            )}
          </div>
        ))}
      </div>
      {rates && rates.unlinked.length > 0 && (
        <>
          <Eyebrow className="dieta-rates-title">Sem produto · não conta</Eyebrow>
          <div className="dieta-rates-unlinked">{rates.unlinked.map((u) => perDayLabel(u.rawName, u.perDay, u.unit)).join(" · ")}</div>
        </>
      )}
    </aside>
  );
}

// ---------- A: alimentos → produtos ----------

function suggestionInput(l: DietLink, gramsPerUnit: number | null | undefined): DietLinkInput | null {
  const s = l.suggestion;
  if (!s) return null;
  const base = s.genericProductId ? { rawName: l.rawName, genericProductId: s.genericProductId } : { rawName: l.rawName, newProductName: s.proposedName };
  const gpu = gramsPerUnit ?? s.gramsPerUnit;
  return gpu ? { ...base, gramsPerUnit: gpu } : base;
}

function LinksStep({ plan, hinted, onSave }: { plan: DietPlan; hinted: Set<string>; onSave: (links: DietLinkInput[]) => Promise<void> }) {
  const [picking, setPicking] = useState<DietLink | null>(null);
  const counted = plan.links.filter((l) => !l.adLibitumOnly);
  const free = plan.links.filter((l) => l.adLibitumOnly);

  function picked(l: DietLink, p: PickedProduct) {
    const gpu = l.gramsPerUnit ?? l.suggestion?.gramsPerUnit ?? null;
    const target = "genericProductId" in p ? { genericProductId: p.genericProductId } : { newProductName: p.newProductName };
    void onSave([{ rawName: l.rawName, ...target, ...(gpu ? { gramsPerUnit: gpu } : {}) }]);
  }

  return (
    <>
      <div className="dieta-links">
        {counted.map((l) => (
          <LinkRow key={l.rawName} link={l} needsSize={!!l.genericProductId && hinted.has(l.genericProductId)} onSave={onSave} onPick={() => setPicking(l)} />
        ))}
      </div>
      {free.length > 0 && (
        <div className="dieta-free">
          <Icon name="eco" size={26} className="tone-subtle" />
          {free.map((l) => capitalize(l.rawName)).join(", ")}: à vontade, não entra na conta.
        </div>
      )}
      {picking && (
        <ProductSheet
          kind="pick"
          title={`“${capitalize(picking.rawName)}” é qual produto?`}
          initialQuery={picking.productName ?? picking.suggestion?.proposedName ?? picking.rawName}
          onClose={() => setPicking(null)}
          onPick={(p) => picked(picking, p)}
        />
      )}
    </>
  );
}

function LinkRow({ link: l, needsSize, onSave, onPick }: { link: DietLink; needsSize: boolean; onSave: (links: DietLinkInput[]) => Promise<void>; onPick: () => void }) {
  const initial = l.gramsPerUnit ?? l.suggestion?.gramsPerUnit ?? null;
  // Tamanho da unidade só onde importa: cápsulas (mg/UI), unidades com tamanho conhecido ou que o "Por dia" pede.
  const unitLabel = l.units.includes("mg") || l.units.includes("ui") || initial != null || needsSize ? perUnitLabel(l) : null;
  const [gpu, setGpu] = useState(initial != null ? String(initial).replace(".", ",") : "");
  const gpuNum = Number(gpu.replace(",", ".")) > 0 ? Number(gpu.replace(",", ".")) : null;
  const linked = !!l.genericProductId;
  const s = l.suggestion;

  function saveGpu() {
    if (!linked || gpuNum === l.gramsPerUnit) return;
    void onSave([{ rawName: l.rawName, gramsPerUnit: gpuNum }]);
  }

  const status = linked ? (
    <span className="tag tag-ok">ligado</span>
  ) : s?.status === "new" ? (
    <span className="tag tag-dashed tag-sm">produto novo</span>
  ) : (
    <span className="tag tag-dashed tag-sm">sugestão</span>
  );
  const target = linked ? l.productName : s ? (s.status === "new" ? s.proposedName : s.name) : null;

  return (
    <div className={`dieta-link${linked ? " linked" : ""}`}>
      <div className="dieta-link-text">
        <div className="dieta-link-raw">
          {capitalize(l.rawName)}
          {l.usedIn > 1 && <span className="tone-subtle"> · {l.usedIn}×</span>}
        </div>
        <div className="dieta-link-target">
          <Icon name="arrow_forward" size={22} className="tone-subtle" />
          <span className={linked ? "strong" : undefined}>{target ? capitalize(target) : "escolha um produto"}</span>
          {status}
        </div>
      </div>
      {unitLabel && (
        <label className="dieta-gpu">
          <input
            className="cfg-input num"
            inputMode="decimal"
            value={gpu}
            placeholder="?"
            onChange={(e) => setGpu(e.target.value)}
            onBlur={saveGpu}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            aria-label={`${unitLabel} de ${l.rawName}`}
          />
          <span className="dieta-gpu-label">{unitLabel}</span>
        </label>
      )}
      <div className="dieta-link-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onPick}>
          {linked ? "Trocar" : "Outro"}
        </button>
        {!linked && s && (
          <button type="button" className="btn btn-outline-light btn-sm" onClick={() => onSave([suggestionInput(l, gpuNum)!])}>
            Confirmar
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- B: escolhas por slot ----------

type Mode = "one" | "half" | "alt";
const MODES: { key: Mode; label: string }[] = [
  { key: "one", label: "Só esta" },
  { key: "half", label: "Metade" },
  { key: "alt", label: "Alterna" },
];

/** Opções escolhidas (peso guardado > 0); sem escolha, a primeira. */
function selected(s: DietSlot): string[] {
  const on = s.options.filter((o) => (o.weight ?? 0) > 0).map((o) => o.id);
  return on.length ? on : [s.options[0].id];
}

/** Plano com as escolhas de um slot trocadas (para a tela responder antes da API). */
function withSlot(plan: DietPlan, slotId: string, sel: string[], include: boolean): DietPlan {
  return {
    ...plan,
    meals: plan.meals.map((m) => ({
      ...m,
      slots: m.slots.map((s) => {
        if (s.id !== slotId) return s;
        const counts = !s.adLibitum && (!s.optional || include);
        return {
          ...s,
          includeOptional: include,
          options: s.options.map((o) => ({ ...o, weight: sel.includes(o.id) ? 1 : 0, effectiveWeight: counts && sel.includes(o.id) ? 1 / sel.length : 0 })),
        };
      }),
    })),
  };
}

function ChoicesStep({ plan, onChange, onSaved }: { plan: DietPlan; onChange: (p: DietPlan) => void; onSaved: (p: DietPlan | undefined) => void }) {
  const k = useKiosk();

  async function save(s: DietSlot, sel: string[], include: boolean) {
    onChange(withSlot(plan, s.id, sel, include));
    const body = { slotId: s.id, weights: sel.map((optionId) => ({ optionId, weight: 1 })), ...(s.optional ? { includeOptional: include } : {}) };
    onSaved(await k.write(() => api.saveDietChoices(plan.id, [body])));
  }

  return (
    <div className="dieta-choices">
      {plan.meals.map((m) => (
        <div key={m.id} className="dieta-cmeal">
          <Eyebrow className="dieta-cmeal-title">{m.name}</Eyebrow>
          {m.slots.map((s) => (
            <SlotChoice key={s.id} slot={s} onSave={(sel, inc) => save(s, sel, inc)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function SlotChoice({ slot: s, onSave }: { slot: DietSlot; onSave: (sel: string[], include: boolean) => void }) {
  const sel = selected(s);
  const [mode, setMode] = useState<Mode>(sel.length >= 3 ? "alt" : sel.length === 2 ? "half" : "one");
  const multi = s.options.length > 1;
  const on = !s.optional || s.includeOptional;
  const note = s.note ? <div className="dieta-slot-note">{s.note}</div> : null;

  if (s.adLibitum) {
    return (
      <div className="dieta-slot muted">
        <div>{s.options.map((o) => o.label).join(" / ")} · à vontade</div>
        {note}
      </div>
    );
  }

  function pick(id: string) {
    let next: string[];
    if (mode === "one") next = [id];
    else if (sel.includes(id)) next = sel.length > 1 ? sel.filter((x) => x !== id) : sel;
    else next = mode === "half" ? [...sel, id].slice(-2) : [...sel, id];
    if (next.join() !== sel.join()) onSave(next, s.includeOptional);
  }

  function changeMode(m: Mode) {
    setMode(m);
    const extra = s.options.find((o) => !sel.includes(o.id))?.id;
    if (m === "one" && sel.length > 1) onSave(sel.slice(0, 1), s.includeOptional);
    if (m === "half" && sel.length !== 2) onSave(sel.length > 2 ? sel.slice(0, 2) : extra ? [...sel, extra] : sel, s.includeOptional);
    if (m === "alt" && sel.length < 2 && extra) onSave([...sel, extra], s.includeOptional);
  }

  return (
    <div className={`dieta-slot${on ? "" : " off"}`}>
      {s.optional && (
        <div className="dieta-slot-opt">
          <span>
            Incluir {multi ? s.options.map((o) => o.label).join(" ou ") : s.options[0].label}
            <span className="tone-subtle"> · opcional</span>
          </span>
          <Toggle label={`Incluir ${s.options[0].label}`} on={s.includeOptional} onChange={(v) => onSave(sel, v)} />
        </div>
      )}
      {!multi && !s.optional && (
        <div className="dieta-slot-one">
          {s.kind === "supplement" && <Icon name="pill" size={24} className="tone-subtle" />}
          {s.options[0].label}
        </div>
      )}
      {multi && on && (
        <div className="dieta-slot-multi">
          <div className="seg seg-sm dieta-slot-modes" role="radiogroup" aria-label="Como você alterna">
            {MODES.map((x) => (
              <button key={x.key} type="button" role="radio" aria-checked={mode === x.key} className={mode === x.key ? "on" : ""} onClick={() => changeMode(x.key)}>
                {x.label}
              </button>
            ))}
          </div>
          <div className="dieta-opts">
            {s.options.map((o) => {
              const isOn = sel.includes(o.id);
              return (
                <button key={o.id} type="button" className={`dieta-opt${isOn ? " on" : ""}`} aria-pressed={isOn} onClick={() => pick(o.id)}>
                  <Icon name={isOn ? "check_circle" : "radio_button_unchecked"} size={26} fill={isOn} />
                  <span className="dieta-opt-label">{o.label}</span>
                  {isOn && sel.length > 1 && <span className="dieta-opt-pct num">{Math.round(100 / sel.length)}%</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {note}
    </div>
  );
}

// ---------- C: dias ----------

function DaysStep({ plan, onSaved }: { plan: DietPlan; onSaved: (p: DietPlan | undefined) => void }) {
  const k = useKiosk();
  const [days, setDays] = useState(plan.dietWeekdays);

  async function toggle(i: number) {
    const next = days.includes(i) ? days.filter((d) => d !== i) : [...days, i].sort((a, b) => a - b);
    if (!next.length) return;
    setDays(next);
    onSaved(await k.write(() => api.updateDiet(plan.id, { dietWeekdays: next })));
  }

  return (
    <div className="dieta-days">
      <div className="dieta-note">Em quais dias da semana você segue a dieta? Nos outros, a dieta não conta no consumo.</div>
      <div className="cfg-days dieta-days-chips">
        {WEEKDAYS_SHORT.map((d, i) => {
          const on = days.includes(i);
          return (
            <button key={d} type="button" className={`day-chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(i)}>
              {capitalize(d)}
            </button>
          );
        })}
      </div>
      <div className="dieta-note">
        {days.length === 7 ? "Todos os dias contam." : `${days.length} ${days.length === 1 ? "dia" : "dias"} por semana.`} Os dias em que você não seguir, marque depois na tela da dieta (“Hoje não segui”).
      </div>
    </div>
  );
}
