"use client";

// Diário da dieta: refeição → opção → quantidades já preenchidas → registra o consumo (POST /diet/log).
// O registro baixa o estoque e a API não sabe desfazer: grava só quando o aviso some (Desfazer cancela).

import { useEffect, useState } from "react";
import { api, type DietItem, type DietPlan } from "@/lib/api";
import { chosenOptions, itemAmount } from "@/lib/diet";
import { capitalize } from "@/lib/format";
import { useKiosk } from "../shell/context";
import { Eyebrow, Icon } from "../ui";

const UNIT_WORD: Record<string, string> = { g: "g", ml: "ml", un: "un.", mg: "mg", ui: "UI" };

function defaultMeal(plan: DietPlan, now = new Date()): string {
  // Sem refeição escolhida: a do momento do dia (café, almoço, lanche, jantar…), pela ordem do plano.
  const meals = plan.meals;
  const slot = Math.min(meals.length - 1, Math.floor(Math.max(0, now.getHours() - 6) / (16 / meals.length)));
  return meals[Math.max(0, slot)]?.id ?? "";
}

export function DiarySheet({ plan, mealId, onClose }: { plan: DietPlan; mealId?: string; onClose: () => void }) {
  const k = useKiosk();
  const [meal, setMeal] = useState(mealId ?? defaultMeal(plan));
  const m = plan.meals.find((x) => x.id === meal) ?? plan.meals[0];
  const slots = (m?.slots ?? []).filter((s) => !s.adLibitum);
  const [optionId, setOptionId] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const option = slots.flatMap((s) => s.options).find((o) => o.id === optionId) ?? null;
  const items = option?.items ?? [];
  const valueOf = (it: DietItem) => qty[it.id] ?? (it.quantity != null ? String(it.quantity).replace(".", ",") : "");
  const amountOf = (it: DietItem) => Number(valueOf(it).replace(",", "."));
  const loggable = items.filter((it) => it.genericProductId && it.unit && amountOf(it) > 0);

  function pickMeal(id: string) {
    setMeal(id);
    setOptionId(null);
    setQty({});
  }

  function register() {
    if (!option || !m) return;
    const entries = loggable.map((it) => ({ genericProductId: it.genericProductId!, quantity: amountOf(it), unit: it.unit!, name: it.productName ?? it.rawName }));
    // Se a rede cair no meio, a nova tentativa só manda o que ainda não foi.
    const sent = new Set<number>();
    const commit = async () => {
      for (const [i, e] of entries.entries()) {
        if (sent.has(i)) continue;
        await api.logDiet({ mealId: m.id, memberId: plan.memberId, genericProductId: e.genericProductId, quantity: e.quantity, unit: e.unit });
        sent.add(i);
      }
    };
    onClose();
    const what = entries.map((e) => (e.unit === "un" ? `${itemAmount(e.quantity, e.unit)} ${e.name}` : `${itemAmount(e.quantity, e.unit)} de ${e.name}`)).join(", ");
    k.toast(`Registrado no ${m.name.toLowerCase()}: ${what}`, { commit });
  }

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden />
      <div className="sheet sheet-tall diary" role="dialog" aria-modal aria-labelledby="diary-title">
        <div className="sheet-grip" />
        <div className="sheet-head">
          <div>
            <div id="diary-title" className="sheet-title">
              Registrar o que comi
            </div>
            <div className="sheet-sub">Desconta do estoque o que foi comido. Opcional — deixa a previsão mais certeira.</div>
          </div>
          <button type="button" className="round-btn round-btn-dark" aria-label="Fechar" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        <div className="diary-meals" role="tablist" aria-label="Refeição">
          {plan.meals.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={x.id === m?.id} className={`day-chip${x.id === m?.id ? " on" : ""}`} onClick={() => pickMeal(x.id)}>
              {x.name}
            </button>
          ))}
        </div>

        <div className="sheet-scroll diary-body">
          <div>
            <Eyebrow className="sheet-eyebrow">O que você comeu?</Eyebrow>
            {slots.map((s) => {
              const usual = new Set(chosenOptions(s).map((o) => o.id));
              return (
                <div key={s.id} className="diary-opts">
                  {s.options.map((o) => (
                    <button key={o.id} type="button" className={`diary-opt${o.id === optionId ? " on" : ""}`} aria-pressed={o.id === optionId} onClick={() => setOptionId(o.id)}>
                      <span className="diary-opt-label">{o.label}</span>
                      {usual.has(o.id) && s.options.length > 1 && <span className="diary-opt-sub">de costume</span>}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
          {option && (
            <div className="diary-qty">
              <Eyebrow className="sheet-eyebrow">Quanto</Eyebrow>
              {items.map((it) => (
                <label key={it.id} className="diary-item">
                  <span className="diary-item-name">
                    {capitalize(it.productName ?? it.rawName)}
                    {!it.genericProductId && <span className="diary-item-sub">sem produto ligado · não registra</span>}
                  </span>
                  <input
                    className="cfg-input diary-input num"
                    inputMode="decimal"
                    value={valueOf(it)}
                    disabled={!it.genericProductId}
                    onChange={(e) => setQty((q) => ({ ...q, [it.id]: e.target.value }))}
                    aria-label={`Quantidade de ${it.rawName}`}
                  />
                  <span className="diary-unit">{it.unit ? UNIT_WORD[it.unit] : ""}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="row-gap row-end diary-actions">
          <button type="button" className="btn btn-primary btn-lg" disabled={!loggable.length} onClick={register}>
            Registrar
          </button>
        </div>
      </div>
    </>
  );
}
