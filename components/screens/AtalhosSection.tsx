"use client";

// Configurações → Avisos no iPhone (Atalhos): moradores com código próprio, zonas de presença e o passo a passo
// para montar as automações (o servidor nunca envia push; o Atalho pergunta à API e mostra a notificação).

import { useState } from "react";
import { api, API_URL, type Member, type Zone } from "@/lib/api";
import { useResource } from "@/lib/useResource";
import { useKiosk } from "../shell/context";
import { Eyebrow, Icon, Toggle } from "../ui";

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-field">
      <div className="copy-label">{label}</div>
      <div className="copy-row">
        <code className="mono copy-value">{value}</code>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() =>
            navigator.clipboard
              ?.writeText(value)
              .then(() => setCopied(true))
              .catch(() => {})
          }
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

/** Passo a passo com as duas URLs do morador (o código só aparece agora; gerar de novo invalida o anterior). */
function Steps({ member, token, zone }: { member: Member; token: string; zone: string }) {
  const presence = `${API_URL}/presence-events?token=${token}`;
  const digest = `${API_URL}/digest?format=text&token=${token}`;
  return (
    <div className="steps">
      <div className="steps-warn">
        <Icon name="key" size={24} />
        Código do Atalho de {member.displayName}: aparece só agora. Gerar de novo invalida este.
      </div>
      <CopyField label="Aviso ao sair (POST)" value={presence} />
      <CopyField label="Corpo JSON" value={`{ "event": "left", "zone": "${zone}" }`} />
      <CopyField label="Resumo diário (GET)" value={digest} />
      <ol className="steps-list">
        <li>
          No iPhone, app Atalhos → Automação → <b>+</b> → <b>Automação pessoal</b> → <b>Sair</b> → escolha o local → <b>Executar imediatamente</b>.
        </li>
        <li>
          Ação <b>Obter conteúdo da URL</b>: cole a URL do aviso, método <b>POST</b>, corpo <b>JSON</b> com <code>event</code> = <code>left</code> e <code>zone</code> = <code>{zone}</code>.
        </li>
        <li>
          <b>Obter valor do dicionário</b> <code>notify</code> → <b>Se</b> for verdadeiro → <b>Mostrar notificação</b> com <code>title</code> e <code>body</code>.
        </li>
        <li>
          Resumo: nova Automação pessoal → <b>Hora do dia</b> 08:00, diariamente → <b>Executar imediatamente</b> → <b>Obter conteúdo da URL</b> com a URL do resumo →{" "}
          <b>Se</b> o conteúdo tem qualquer valor → <b>Mostrar notificação</b> (título “Governanta”).
        </li>
      </ol>
    </div>
  );
}

export function AtalhosSection() {
  const k = useKiosk();
  const members = useResource((s) => api.getMembers(s), 5 * 60_000);
  const zones = useResource((s) => api.getZones(s), 5 * 60_000);
  const [shown, setShown] = useState<{ member: Member; token: string } | null>(null);
  const [newMember, setNewMember] = useState<string | null>(null);
  const [newZone, setNewZone] = useState<string | null>(null);

  // API antiga (sem /members): a seção some em vez de mostrar erro.
  if (members.error && !members.data) return null;

  const firstZone = zones.data?.find((z) => z.notifyOnLeave)?.code ?? zones.data?.[0]?.code ?? "casa";

  async function generate(m: Member) {
    const token = await k.write(() => api.memberToken(m.id));
    if (token) {
      setShown({ member: m, token });
      members.reload();
    }
  }

  async function addMember() {
    const name = (newMember ?? "").trim();
    setNewMember(null);
    if (!name) return;
    await k.write(() => api.addMember(name));
    members.reload();
    k.reloadHousehold();
  }

  async function removeMember(m: Member) {
    if (shown?.member.id === m.id) setShown(null);
    await k.write(() => api.removeMember(m.id));
    members.reload();
    k.reloadHousehold();
  }

  async function addZone() {
    const name = (newZone ?? "").trim();
    setNewZone(null);
    if (!name || !slug(name)) return;
    await k.write(() => api.addZone({ code: slug(name), name, notifyOnLeave: true }));
    zones.reload();
  }

  async function setZone(z: Zone, patch: Partial<Omit<Zone, "id">>) {
    zones.mutate((all) => all?.map((x) => (x.id === z.id ? { ...x, ...patch } : x)));
    await k.write(() => api.updateZone(z.id, patch));
  }

  async function removeZone(z: Zone) {
    zones.mutate((all) => all?.filter((x) => x.id !== z.id));
    await k.write(() => api.removeZone(z.id));
  }

  return (
    <section>
      <Eyebrow className="cfg-title">Avisos no iPhone (Atalhos)</Eyebrow>
      <div className="cfg-box">
        {(members.data ?? []).map((m) => (
          <div key={m.id} className="cfg-row">
            <span>{m.displayName}</span>
            <span className="row-gap">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => generate(m)}>
                {m.hasToken ? "Gerar código de novo" : "Gerar código"}
              </button>
              <button type="button" className="circle" aria-label={`Remover ${m.displayName}`} onClick={() => removeMember(m)}>
                <Icon name="delete" size={26} />
              </button>
            </span>
          </div>
        ))}
        {newMember != null ? (
          <form
            className="cfg-row"
            onSubmit={(e) => {
              e.preventDefault();
              void addMember();
            }}
          >
            <span>Morador</span>
            <input className="cfg-input" autoFocus value={newMember} onChange={(e) => setNewMember(e.target.value)} onBlur={addMember} placeholder="Nome" aria-label="Nome do morador" />
          </form>
        ) : (
          <button type="button" className="cfg-row cfg-row-btn" onClick={() => setNewMember("")}>
            <span>Adicionar morador</span>
            <Icon name="add" size={28} className="tone-subtle" />
          </button>
        )}
        {shown && <Steps member={shown.member} token={shown.token} zone={firstZone} />}
      </div>

      <Eyebrow className="cfg-title cfg-title-sub">Lugares (avisar ao sair)</Eyebrow>
      <div className="cfg-box">
        {(zones.data ?? []).map((z) => (
          <div key={z.id} className="cfg-row">
            <span>
              {z.name} <span className="tone-subtle mono cfg-code">{z.code}</span>
            </span>
            <span className="row-gap">
              <Toggle label={`Avisar ao sair de ${z.name}`} on={z.notifyOnLeave} onChange={(v) => setZone(z, { notifyOnLeave: v })} />
              <button type="button" className="circle" aria-label={`Remover ${z.name}`} onClick={() => removeZone(z)}>
                <Icon name="delete" size={26} />
              </button>
            </span>
          </div>
        ))}
        {newZone != null ? (
          <form
            className="cfg-row"
            onSubmit={(e) => {
              e.preventDefault();
              void addZone();
            }}
          >
            <span>Lugar</span>
            <input className="cfg-input" autoFocus value={newZone} onChange={(e) => setNewZone(e.target.value)} onBlur={addZone} placeholder="ex.: Trabalho" aria-label="Nome do lugar" />
          </form>
        ) : (
          <button type="button" className="cfg-row cfg-row-btn" onClick={() => setNewZone("")}>
            <span>Adicionar lugar</span>
            <Icon name="add" size={28} className="tone-subtle" />
          </button>
        )}
      </div>
    </section>
  );
}
