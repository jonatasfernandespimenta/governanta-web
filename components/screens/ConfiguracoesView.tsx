"use client";

// 15 Configurações: casa, sistema, voz e tela, avisos, dias de mercado e atalhos para Despensa, Dieta e Perguntar.

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { api, getLastOkAt, getToken, saveToken, type Household, type HouseholdPrefs, type Settings } from "@/lib/api";
import { WEEKDAYS_SHORT } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { useResource } from "@/lib/useResource";
import { useKiosk } from "../shell/context";
import { BackButton, Eyebrow, Icon, Toggle } from "../ui";
import { AtalhosSection } from "./AtalhosSection";

type MicState = "granted" | "denied" | "prompt" | "unknown";

function useMicPermission(): MicState {
  const [state, setState] = useState<MicState>("unknown");
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const update = () => status && setState(status.state as MicState);
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((s) => {
        status = s;
        update();
        s.addEventListener("change", update);
      })
      .catch(() => {});
    return () => status?.removeEventListener("change", update);
  }, []);
  return state;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <Eyebrow className="cfg-title">{title}</Eyebrow>
      <div className="cfg-box">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cfg-row">
      <span>{label}</span>
      {children}
    </div>
  );
}

/** Linha com valor que vira campo de texto ao tocar. */
function EditRow({ label, value, placeholder, onSave }: { label: string; value: string; placeholder: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft == null) {
    return (
      <button type="button" className="cfg-row cfg-row-btn" onClick={() => setDraft(value)}>
        <span>{label}</span>
        <span className="cfg-value">{value || placeholder}</span>
      </button>
    );
  }
  return (
    <form
      className="cfg-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim() !== value) onSave(draft.trim());
        setDraft(null);
      }}
    >
      <span>{label}</span>
      <input className="cfg-input" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={(e) => e.currentTarget.form?.requestSubmit()} aria-label={label} />
    </form>
  );
}

/** Código da casa guardado neste aparelho (nunca mostrado; só trocado). */
function KeyRow() {
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setHas(!!getToken()), 0);
    return () => clearTimeout(t);
  }, []);
  return (
    <EditRow
      label="Código da casa"
      value=""
      placeholder={has == null ? "" : has ? "guardada neste aparelho" : "não definida"}
      onSave={(v) => {
        saveToken(v || null);
        setHas(!!v || !!getToken());
      }}
    />
  );
}

function syncLabel(now: Date | null, at: number | null): string {
  if (!now || !at) return "sincronizando…";
  const mins = Math.max(0, Math.round((now.getTime() - at) / 60_000));
  return mins < 1 ? "sincronizado agora" : `sincronizado há ${mins} min`;
}

export function ConfiguracoesView() {
  const k = useKiosk();
  const now = useNow();
  const mic = useMicPermission();
  const settings = useResource((s) => api.getSettings(s), 5 * 60_000);
  const h = k.household;

  async function saveHousehold(patch: Partial<Household>) {
    await k.write(() => api.saveHousehold(patch));
    k.reloadHousehold();
  }

  function setPref(key: keyof HouseholdPrefs, value: boolean) {
    void saveHousehold({ prefs: { ...h!.prefs, [key]: value } });
  }

  async function saveSettings(next: Settings) {
    settings.mutate(() => next);
    await k.write(() => api.saveSettings(next));
  }

  const s = settings.data;
  const lastOk = getLastOkAt() ?? (h?.lastSyncAt ? Date.parse(h.lastSyncAt) : null);

  return (
    <div className="page">
      <div className="page-head page-head-start">
        <BackButton fallback="/" />
        <h1 className="page-title">Configurações</h1>
      </div>
      <div className="page-scroll cfg-grid">
        <div className="cfg-col">
          <Section title="Casa">
            {h ? (
              <>
                <EditRow label="Nome" value={h.name} placeholder="sem nome" onSave={(name) => saveHousehold({ name })} />
                <EditRow
                  label="Moradores"
                  value={h.members.join(", ")}
                  placeholder="ninguém ainda"
                  onSave={(v) => saveHousehold({ members: v.split(",").map((x) => x.trim()).filter(Boolean) })}
                />
                <EditRow label="Região" value={h.region ?? ""} placeholder="não informada" onSave={(region) => saveHousehold({ region: region || null })} />
                <Row label="Mercados frequentes">
                  <span className="cfg-value num">{h.frequentMerchantsCount}</span>
                </Row>
              </>
            ) : (
              <Row label="Casa">
                <span className="cfg-value">carregando…</span>
              </Row>
            )}
          </Section>

          <Section title="Sistema">
            <Row label="Conexão">
              <span className="cfg-value">{k.offline ? "sem conexão · as mudanças esperam aqui" : `online · ${syncLabel(now, lastOk)}`}</span>
            </Row>
            <KeyRow />
            <Link href="/onboarding" className="cfg-row cfg-row-btn">
              <span>Refazer configuração inicial</span>
              <Icon name="chevron_right" size={28} className="tone-subtle" />
            </Link>
          </Section>

          <Section title="Dias de mercado">
            <div className="cfg-row cfg-days">
              {WEEKDAYS_SHORT.map((d, i) => {
                const on = s?.shopDays.includes(i) ?? false;
                return (
                  <button
                    key={d}
                    type="button"
                    className={`day-chip${on ? " on" : ""}`}
                    aria-pressed={on}
                    disabled={!s}
                    onClick={() => s && saveSettings({ ...s, shopDays: on ? s.shopDays.filter((x) => x !== i) : [...s.shopDays, i].sort((a, b) => a - b) })}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            <Row label="Pôr na lista o que deve acabar antes da compra">
              <Toggle label="Pôr na lista o que deve acabar antes da compra" on={s?.anticipationEnabled ?? false} onChange={(v) => s && saveSettings({ ...s, anticipationEnabled: v })} />
            </Row>
          </Section>
        </div>

        <div className="cfg-col">
          <Section title="Voz e tela">
            <Row label="Microfone">
              <span className={`cfg-value${mic === "granted" ? " tone-ok" : mic === "denied" ? " tone-bad" : ""}`}>
                {mic === "granted" ? "permitido" : mic === "denied" ? "bloqueado" : mic === "prompt" ? "pergunta ao usar" : "—"}
              </span>
            </Row>
            <Row label="Botão Falar sempre visível">
              <Toggle label="Botão Falar sempre visível" on={h?.prefs.voiceButtonAlwaysVisible ?? true} onChange={(v) => setPref("voiceButtonAlwaysVisible", v)} />
            </Row>
            <Row label="Escurecer à noite (22h–6h)">
              <Toggle label="Escurecer à noite" on={h?.prefs.dimAtNight ?? false} onChange={(v) => setPref("dimAtNight", v)} />
            </Row>
          </Section>

          <Section title="Avisos no celular">
            <Row label="Lembrete na véspera da compra">
              <Toggle label="Lembrete na véspera da compra" on={h?.prefs.notifyEveBeforeTrip ?? false} onChange={(v) => setPref("notifyEveBeforeTrip", v)} />
            </Row>
            <Row label="Quando algo deve acabar">
              <Toggle label="Quando algo deve acabar" on={h?.prefs.notifyRunningOut ?? false} onChange={(v) => setPref("notifyRunningOut", v)} />
            </Row>
            <Row label="Resumo semanal de gastos">
              <Toggle label="Resumo semanal de gastos" on={h?.prefs.weeklySpendSummary ?? false} onChange={(v) => setPref("weeklySpendSummary", v)} />
            </Row>
          </Section>

          <AtalhosSection />

          <Section title="Mais">
            <Link href="/despensa" className="cfg-row cfg-row-btn">
              <span>Despensa</span>
              <Icon name="chevron_right" size={28} className="tone-subtle" />
            </Link>
            <Link href="/dieta" className="cfg-row cfg-row-btn">
              <span>Dieta</span>
              <Icon name="chevron_right" size={28} className="tone-subtle" />
            </Link>
            <Link href="/perguntar" className="cfg-row cfg-row-btn">
              <span>Perguntar à Governanta</span>
              <Icon name="chevron_right" size={28} className="tone-subtle" />
            </Link>
          </Section>
        </div>
      </div>
    </div>
  );
}
