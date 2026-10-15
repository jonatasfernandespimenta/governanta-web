"use client";

// Telas 02 (ouvindo / entendendo), 03 (confirmação) e 03b (ambiguidade). A voz (lib/voice) só entrega
// estado e intents; aqui cada intent vira produto (resolveProduct) e a chamada certa da API.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { api, authedFetch, QTY_UNITS, type QtyUnit } from "@/lib/api";
import { capitalize, fractionGlyph, qtyLabel } from "@/lib/format";
import { parseCommand, resolveProduct, useVoice, type VoiceIntent, type VoiceProduct } from "@/lib/voice";
import { Icon } from "../ui";
import { useKiosk, type SheetKind } from "./context";

type ProductIntent = Extract<VoiceIntent, { product: string }>;

type Result = { title: string; sub: string; commit?: () => Promise<unknown>; undo?: () => Promise<unknown> };

type Flow =
  | { step: "resolving"; text: string }
  | { step: "ambiguous"; text: string; intent: ProductIntent; candidates: VoiceProduct[]; rest: VoiceIntent[]; done: Result[] }
  | { step: "confirmed"; results: Result[] }
  | { step: "notfound"; intent: ProductIntent }
  | { step: "unknown"; text: string }
  | { step: "failed"; text: string; intents: VoiceIntent[] };

const AUTO_CLOSE_MS = 10_000;
const HINT = "Experimente: “acabou o leite” · “coloca 2 kg de tomate” · “usei dois pães”";

const SHEET_FOR: Record<ProductIntent["kind"], SheetKind> = { depleted: "acabou", add_to_list: "add", remove_from_list: "add", used: "usei" };

function question(intent: ProductIntent): string {
  const p = intent.product;
  if (intent.kind === "depleted") return `Qual ${p} acabou?`;
  if (intent.kind === "add_to_list") return `Qual ${p} vai para a lista?`;
  if (intent.kind === "remove_from_list") return `Qual ${p} sai da lista?`;
  return `Qual ${p} vocês usaram?`;
}

const toUnit = (u: string | undefined): QtyUnit | null => (u && (QTY_UNITS as string[]).includes(u) ? (u as QtyUnit) : null);
const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");

async function act(intent: ProductIntent, p: VoiceProduct): Promise<Result> {
  const name = capitalize(p.name);
  const loc = p.location ?? null;
  if (intent.kind === "depleted") {
    return {
      title: p.onList ? `${name} já está na lista.` : `${name} foi adicionado à lista.`,
      sub: join(loc, "marcado como acabou"),
      commit: () => api.depleted(p.id, "voice"),
    };
  }
  if (intent.kind === "used") {
    const { fraction, quantity } = intent;
    const unit = toUnit(intent.unit);
    const amount =
      fraction != null ? fractionGlyph(fraction) : quantity != null ? (unit ? qtyLabel(quantity, unit) : `${quantity} ${quantity === 1 ? "unidade" : "unidades"}`) : null;
    return {
      title: amount ? `Registrei ${amount} de ${p.name.toLowerCase()}.` : `Registrei o uso de ${p.name.toLowerCase()}.`,
      sub: join(loc, "uso registrado"),
      commit: () => api.used({ genericProductId: p.id, fraction, quantity, unit: intent.unit, source: "voice" }),
    };
  }
  const list = await api.getShoppingList();
  const ex = list.find((i) => i.genericProductId === p.id && i.status !== "purchased");
  if (intent.kind === "remove_from_list") {
    if (!ex) return { title: `${name} não estava na lista.`, sub: loc ?? "" };
    return { title: `${name} saiu da lista.`, sub: join(loc, qtyLabel(ex.quantity, ex.unit)), commit: () => api.removeListItem(ex.id) };
  }
  const qty = intent.quantity ?? null;
  const unit = toUnit(intent.unit) ?? (qty != null ? "un" : null);
  if (ex) {
    if (qty == null) return { title: `${name} já está na lista.`, sub: join(loc, qtyLabel(ex.quantity, ex.unit)) };
    const prev = { quantity: ex.quantity ?? null, unit: ex.unit ?? null };
    await api.updateListItem(ex.id, { quantity: qty, unit });
    const before = qtyLabel(prev.quantity, prev.unit);
    return {
      title: `${name} atualizado para ${qtyLabel(qty, unit)}.`,
      sub: join(loc, before ? `antes estava ${before} na lista` : "já estava na lista"),
      undo: () => api.updateListItem(ex.id, prev),
    };
  }
  const item = await api.addListItem({ genericProductId: p.id, quantity: qty, unit });
  return { title: `${name} foi adicionado à lista.`, sub: join(qtyLabel(qty, unit), loc), undo: () => api.removeListItem(item.id) };
}

export function VoiceOverlay({ startRef }: { startRef: RefObject<() => void> }) {
  const k = useKiosk();
  const router = useRouter();
  const { state, start: startListening, cancel: cancelVoice } = useVoice();
  const [flow, setFlow] = useState<Flow | null>(null);
  const flowRef = useRef<Flow | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((f: Flow | null) => {
    flowRef.current = f;
    setFlow(f);
  }, []);

  /** Fecha e grava o que ficou pendente (as ações que só gravam quando ninguém desfaz). */
  const close = useCallback(() => {
    clearTimeout(closeTimer.current);
    const f = flowRef.current;
    if (f?.step === "confirmed") for (const r of f.results) if (r.commit) void k.write(r.commit);
    if (f?.step === "ambiguous") for (const r of f.done) if (r.commit) void k.write(r.commit);
    show(null);
    cancelVoice();
  }, [k, show, cancelVoice]);

  const undo = useCallback(() => {
    clearTimeout(closeTimer.current);
    const f = flowRef.current;
    if (f?.step === "confirmed") for (const r of f.results) if (r.undo) void k.write(r.undo);
    show(null);
    cancelVoice();
    k.toast("Comando desfeito");
  }, [k, show, cancelVoice]);

  const finish = useCallback(
    (results: Result[]) => {
      if (!results.length) {
        show(null);
        return;
      }
      show({ step: "confirmed", results });
      clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(close, AUTO_CLOSE_MS);
    },
    [close, show],
  );

  /** Processa os intents em ordem; pausa na primeira ambiguidade e continua depois da escolha. */
  const run = useCallback(
    async (text: string, intents: VoiceIntent[], done: Result[] = []) => {
      show({ step: "resolving", text });
      const results = [...done];
      for (let i = 0; i < intents.length; i++) {
        const intent = intents[i];
        if (intent.kind === "cancel") {
          show(null);
          return;
        }
        if (intent.kind === "unknown") {
          if (!results.length && intents.length === 1) {
            show({ step: "unknown", text: intent.text || text });
            return;
          }
          continue;
        }
        try {
          const r = await resolveProduct(intent.product, { fetch: authedFetch });
          if (r.status === "many") {
            show({ step: "ambiguous", text, intent, candidates: r.candidates, rest: intents.slice(i + 1), done: results });
            return;
          }
          if (r.status === "none") {
            if (intent.kind === "add_to_list") {
              const name = capitalize(intent.product);
              const unit = toUnit(intent.unit) ?? (intent.quantity != null ? "un" : null);
              const item = await api.addListItem({ freeText: name, quantity: intent.quantity ?? null, unit });
              results.push({ title: `${name} foi adicionado à lista.`, sub: join(qtyLabel(intent.quantity, unit), "item novo, sem cadastro"), undo: () => api.removeListItem(item.id) });
              continue;
            }
            if (!results.length && intents.length === 1) {
              show({ step: "notfound", intent });
              return;
            }
            continue;
          }
          results.push(await act(intent, r.product));
        } catch {
          show({ step: "failed", text, intents: intents.slice(i) });
          return;
        }
      }
      if (!results.length) show({ step: "unknown", text });
      else finish(results);
    },
    [finish, show],
  );

  const pick = useCallback(
    async (p: VoiceProduct) => {
      const f = flowRef.current;
      if (f?.step !== "ambiguous") return;
      show({ step: "resolving", text: f.text });
      try {
        const r = await act(f.intent, p);
        await run(f.text, f.rest, [...f.done, r]);
      } catch {
        show({ step: "failed", text: f.text, intents: [f.intent, ...f.rest] });
      }
    },
    [run, show],
  );

  const begin = useCallback(() => {
    close();
    startListening();
  }, [close, startListening]);

  useEffect(() => {
    startRef.current = begin;
  }, [begin, startRef]);

  // A voz entregou o texto: o hook volta a "idle" e o fluxo assume a tela.
  useEffect(() => {
    if (state.phase !== "result") return;
    const { text, intents } = state;
    cancelVoice();
    // Fora do corpo do efeito: o resultado chega de um sistema externo (o worker da voz).
    queueMicrotask(() => void run(text, intents));
  }, [state, cancelVoice, run]);

  // Teste sem microfone (só fora de produção): window.__governantaVoice("acabou o leite").
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __governantaVoice?: (text: string) => void };
    w.__governantaVoice = (text) => void run(text, parseCommand(text));
    return () => {
      delete w.__governantaVoice;
    };
  }, [run]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const openSheet = (intent: ProductIntent) => {
    show(null);
    cancelVoice();
    k.openSheet(SHEET_FOR[intent.kind], intent.product);
  };

  const phase = state.phase;
  if (!flow && (phase === "idle" || phase === "result")) return null;

  const level = phase === "listening" ? state.level : 0;

  return (
    <div className="voice" role="dialog" aria-modal aria-live="polite">
      {!flow && phase === "listening" && (
        <div className="voice-col">
          <div className="wave" style={{ "--lvl": Math.min(1, level * 4) } as CSSProperties}>
            <span className="wave-ring" />
            {[50, 80, 110, 90, 110, 80, 50].map((h, i) => (
              <span key={i} className="wave-bar" style={{ "--h": h, animationDelay: `${(i % 4) * 0.13}s` } as CSSProperties} />
            ))}
          </div>
          <div className="voice-title">Estou ouvindo</div>
          <div className="voice-hint">{HINT}</div>
          <button type="button" className="btn btn-outline btn-md voice-cancel" onClick={close}>
            <Icon name="close" />
            Cancelar
          </button>
        </div>
      )}

      {((!flow && (phase === "transcribing" || phase === "loading-model")) || flow?.step === "resolving") && (
        <div className="voice-col">
          <div className="spin">
            <span className="spin-ring" />
            <i />
            <i />
            <i />
          </div>
          {phase === "loading-model" && !flow ? (
            <>
              <div className="voice-title">Preparando a voz…</div>
              <div className="voice-quote">{Math.round(state.progress * 100)}% · só na primeira vez</div>
            </>
          ) : (
            <>
              <div className="voice-title">Entendendo…</div>
              {flow?.step === "resolving" && flow.text && <div className="voice-quote">“{capitalize(flow.text)}”</div>}
            </>
          )}
          {!flow && (
            <button type="button" className="btn btn-ghost btn-md voice-cancel" onClick={close}>
              Cancelar
            </button>
          )}
        </div>
      )}

      {flow?.step === "ambiguous" && (
        <div className="voice-col voice-ambig">
          <div className="voice-said">“{capitalize(flow.text)}”</div>
          <div className="voice-title voice-title-tight">{question(flow.intent)}</div>
          <div className="ambig-opts">
            {flow.candidates.map((c) => (
              <button key={c.id} type="button" className="ambig-opt" onClick={() => void pick(c)}>
                <span className="radio" />
                <span className="ambig-text">
                  <span className="ambig-name">{capitalize(c.name)}</span>
                  <span className="ambig-sub">{join(c.location, c.onList && "já está na lista") || "no catálogo da casa"}</span>
                </span>
              </button>
            ))}
            <button type="button" className="ambig-opt" onClick={() => openSheet(flow.intent)}>
              <span className="radio" />
              <span className="ambig-text">
                <span className="ambig-name">Outro</span>
                <span className="ambig-sub">escolher outro produto</span>
              </span>
            </button>
          </div>
          <button type="button" className="btn btn-ghost btn-sm voice-cancel-sm" onClick={close}>
            Cancelar
          </button>
        </div>
      )}

      {flow?.step === "confirmed" && (
        <div className="voice-col">
          <div className="ok-ring">
            <Icon name="check" size={68} />
          </div>
          {flow.results.length === 1 ? (
            <>
              <div className="voice-title voice-title-confirm">{flow.results[0].title}</div>
              {flow.results[0].sub && <div className="voice-sub">{flow.results[0].sub}</div>}
            </>
          ) : (
            <>
              <div className="voice-title voice-title-confirm">Pronto, {flow.results.length} registros.</div>
              <div className="voice-sub voice-sub-list">
                {flow.results.map((r, i) => (
                  <div key={i}>{r.title}</div>
                ))}
              </div>
            </>
          )}
          <div className="voice-actions">
            {flow.results.some((r) => r.undo || r.commit) && (
              <button type="button" className="btn btn-outline btn-lg voice-btn" onClick={undo}>
                Desfazer
              </button>
            )}
            <button type="button" className="btn btn-primary btn-lg voice-btn" onClick={close}>
              Pronto
            </button>
          </div>
        </div>
      )}

      {flow?.step === "notfound" && (
        <VoiceMessage icon="search_off" title={`Não achei “${flow.intent.product}”.`} text="Toque em Buscar para escolher o produto na lista da casa.">
          <button type="button" className="btn btn-outline btn-lg" onClick={close}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => openSheet(flow.intent)}>
            Buscar
          </button>
        </VoiceMessage>
      )}

      {flow?.step === "unknown" && (
        <VoiceMessage icon="hearing" title={flow.text ? "Não entendi." : "Não ouvi nada."} text={flow.text ? `“${capitalize(flow.text)}”. ${HINT}` : HINT}>
          <button type="button" className="btn btn-outline btn-lg" onClick={close}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-lg" onClick={begin}>
            Falar de novo
          </button>
        </VoiceMessage>
      )}

      {flow?.step === "failed" && (
        <VoiceMessage icon="wifi_off" title="Não consegui registrar agora." text="A conexão com a casa falhou. Nada foi gravado deste comando.">
          <button type="button" className="btn btn-outline btn-lg" onClick={close}>
            Fechar
          </button>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => void run(flow.text, flow.intents)}>
            Tentar de novo
          </button>
        </VoiceMessage>
      )}

      {!flow && phase === "error" && (
        <>
          {state.reason === "mic-denied" || state.reason === "mic-unavailable" ? (
            <VoiceMessage icon="mic_off" title="O microfone não está disponível" text="Verifique a permissão do microfone nas configurações do tablet. Enquanto isso, use Acabou algo ou Adicionar item.">
              <button
                type="button"
                className="btn btn-outline btn-lg"
                onClick={() => {
                  close();
                  router.push("/configuracoes");
                }}
              >
                Abrir permissões
              </button>
              <button type="button" className="btn btn-primary btn-lg" onClick={close}>
                Entendi
              </button>
            </VoiceMessage>
          ) : (
            <VoiceMessage
              icon="mic_off"
              title={state.reason === "unsupported" ? "Este aparelho não reconhece voz" : "A voz não carregou"}
              text={state.reason === "unsupported" ? "Use Acabou algo ou Adicionar item na Casa." : "Tente de novo em instantes. Enquanto isso, use Acabou algo ou Adicionar item."}
            >
              {state.reason !== "unsupported" && (
                <button type="button" className="btn btn-outline btn-lg" onClick={begin}>
                  Tentar de novo
                </button>
              )}
              <button type="button" className="btn btn-primary btn-lg" onClick={close}>
                Entendi
              </button>
            </VoiceMessage>
          )}
        </>
      )}
    </div>
  );
}

function VoiceMessage({ icon, title, text, children }: { icon: string; title: string; text: string; children: ReactNode }) {
  return (
    <div className="voice-col voice-msg">
      <div className="msg-ring">
        <Icon name={icon} size={60} />
      </div>
      <div className="voice-title voice-title-msg">{title}</div>
      <div className="voice-sub voice-sub-msg">{text}</div>
      <div className="voice-actions">{children}</div>
    </div>
  );
}
