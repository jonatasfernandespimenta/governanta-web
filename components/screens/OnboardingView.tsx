"use client";

// 16 Onboarding: nome da casa e moradores, permissões e "Pronto". Dá para pular na primeira vez.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useKiosk } from "../shell/context";
import { Eyebrow, Icon } from "../ui";

type Perm = "mic" | "cam" | "notif";

async function askPermission(p: Perm): Promise<boolean> {
  try {
    if (p === "notif") return typeof Notification !== "undefined" && (await Notification.requestPermission()) === "granted";
    const stream = await navigator.mediaDevices.getUserMedia(p === "mic" ? { audio: true } : { video: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

async function currentPermissions(): Promise<Partial<Record<Perm, boolean>>> {
  const out: Partial<Record<Perm, boolean>> = {};
  const q = async (name: string) => (await navigator.permissions?.query({ name: name as PermissionName }).catch(() => null))?.state === "granted";
  out.mic = await q("microphone");
  out.cam = await q("camera");
  out.notif = typeof Notification !== "undefined" && Notification.permission === "granted";
  return out;
}

const PERMS: { key: Perm; icon: string; title: string; sub: string; ask: string; ok: string }[] = [
  { key: "mic", icon: "mic", title: "Microfone", sub: "para dizer “acabou o leite” de longe", ask: "Permitir", ok: "Permitido" },
  { key: "cam", icon: "photo_camera", title: "Câmera", sub: "para ler o QR Code das notas", ask: "Permitir", ok: "Permitido" },
  { key: "notif", icon: "notifications", title: "Avisos", sub: "lembrete na véspera da compra", ask: "Conectar", ok: "Ativado" },
];

export function OnboardingView() {
  const k = useKiosk();
  const router = useRouter();
  const h = k.household;
  const [step, setStep] = useState(0);
  const [name, setName] = useState<string | null>(null);
  const [members, setMembers] = useState<string[] | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [perms, setPerms] = useState<Partial<Record<Perm, boolean>>>({});
  const [saving, setSaving] = useState(false);

  // Começa com o que a casa já tem (refazer a configuração não apaga nada).
  const nameV = name ?? h?.name ?? "";
  const membersV = members ?? h?.members ?? [];
  const regionV = region ?? h?.region ?? "";
  const firstRun = h ? h.onboardedAt == null : false;

  useEffect(() => {
    if (step === 1) void currentPermissions().then((p) => setPerms((cur) => ({ ...p, ...cur })));
  }, [step]);

  async function next() {
    if (step === 0) {
      setSaving(true);
      await k.write(() => api.saveHousehold({ name: nameV.trim(), members: membersV, region: regionV.trim() || null }));
      setSaving(false);
      k.reloadHousehold();
    }
    setStep((s) => Math.min(2, s + 1));
  }

  async function finish(to: string) {
    setSaving(true);
    await k.write(() => api.completeOnboarding());
    k.reloadHousehold();
    router.replace(to);
  }

  function addMember() {
    const v = (adding ?? "").trim();
    if (v) setMembers([...membersV, v]);
    setAdding(null);
  }

  return (
    <div className="onb">
      <aside className="onb-side">
        <div className="onb-brand">Governanta</div>
        <div className="flex-1" />
        <div className="onb-dots" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className={i === step ? "cur" : i < step ? "done" : ""} />
          ))}
        </div>
        <div className="onb-step">{step + 1} de 3 · leva menos de 1 minuto</div>
        {firstRun && step < 2 && (
          <button type="button" className="onb-skip" onClick={() => finish("/")} disabled={saving}>
            Pular por agora
          </button>
        )}
      </aside>

      <div className="onb-main">
        {step === 0 && (
          <>
            <h1 className="onb-title">Como vamos chamar esta casa?</h1>
            <input className="onb-input" value={nameV} onChange={(e) => setName(e.target.value)} placeholder="Casa Andrade" aria-label="Nome da casa" autoFocus />
            <Eyebrow className="onb-label">Quem mora aqui</Eyebrow>
            <div className="onb-chips">
              {membersV.map((m, i) => (
                <button key={`${m}-${i}`} type="button" className="chip" aria-label={`Remover ${m}`} onClick={() => setMembers(membersV.filter((_, j) => j !== i))}>
                  {m}
                </button>
              ))}
              {adding != null ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addMember();
                  }}
                >
                  <input className="chip chip-input" autoFocus value={adding} onChange={(e) => setAdding(e.target.value)} onBlur={addMember} placeholder="Nome" aria-label="Nome do morador" />
                </form>
              ) : (
                <button type="button" className="chip chip-add" onClick={() => setAdding("")}>
                  <Icon name="add" size={26} />
                  Adicionar
                </button>
              )}
            </div>
            <Eyebrow className="onb-label">Região (para comparar preços)</Eyebrow>
            <div className="onb-region">
              <input className="chip chip-input chip-wide" value={regionV} onChange={(e) => setRegion(e.target.value)} placeholder="Bairro, cidade" aria-label="Região" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>
                Opcional — pular
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="onb-title">Permissões</h1>
            <div className="onb-sub">Dá para mudar depois em Configurações.</div>
            <div className="perm-list">
              {PERMS.map((p) => (
                <div key={p.key} className="perm">
                  <Icon name={p.icon} size={36} />
                  <div className="perm-text">
                    <div className="perm-title">{p.title}</div>
                    <div className="perm-sub">{p.sub}</div>
                  </div>
                  {perms[p.key] ? (
                    <span className="perm-ok">
                      <Icon name="check" size={26} />
                      {p.ok}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={`btn ${p.key === "notif" ? "btn-outline" : "btn-primary"}`}
                      onClick={async () => {
                        const ok = await askPermission(p.key);
                        setPerms((cur) => ({ ...cur, [p.key]: ok }));
                      }}
                    >
                      {p.ask}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="onb-done">Pronto.</h1>
            <div className="onb-done-text">
              A Governanta aprende com as notas que você escaneia e com o que vocês marcam como acabou. As previsões começam a aparecer depois de 2 ou 3 compras.
            </div>
            <div className="onb-hint">Para começar bem: escaneie a nota da última compra.</div>
          </>
        )}

        <div className="flex-1" />
        <div className="onb-foot">
          {step > 0 ? (
            <button type="button" className="btn btn-ghost btn-md" onClick={() => setStep((s) => s - 1)}>
              Voltar
            </button>
          ) : firstRun ? (
            <span />
          ) : (
            <button type="button" className="btn btn-ghost btn-md" onClick={() => router.push("/configuracoes")}>
              Voltar
            </button>
          )}
          {step === 2 ? (
            <div className="row-gap">
              <button type="button" className="btn btn-outline btn-xl" disabled={saving} onClick={() => finish("/escanear")}>
                Escanear primeira nota
              </button>
              <button type="button" className="btn btn-primary btn-xl" disabled={saving} onClick={() => finish("/")}>
                Ir para a Casa
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-primary btn-xl onb-next" disabled={saving} onClick={next}>
              Continuar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
