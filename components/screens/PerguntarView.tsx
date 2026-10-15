"use client";

// Perguntar à Governanta: pergunta livre sobre a despensa (POST /ask, LLM opcional da API).

import { useState } from "react";
import { api, ApiError, type AskResult } from "@/lib/api";
import { useKiosk } from "../shell/context";
import { BackButton, Eyebrow, Icon } from "../ui";

const SUGGESTIONS = ["O que posso cozinhar hoje?", "O que vence primeiro e como uso?", "Vou fazer um brownie, tenho tudo?"];

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 503) return "As perguntas estão desligadas nesta casa (falta configurar a chave da OpenAI na API).";
    if (err.status === 429) return "Chegamos ao limite de perguntas de hoje. Amanhã libera de novo.";
    if (err.status === 400) return "Não entendi a pergunta. Escreva de outro jeito.";
    return "Não consegui responder agora. Tente de novo em instantes.";
  }
  return "Sem conexão com a casa agora.";
}

export function PerguntarView() {
  const k = useKiosk();
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<{ q: string; r: AskResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || asking) return;
    setQuestion(q);
    setAsking(true);
    setError(null);
    setAdded(false);
    try {
      setResult({ q, r: await api.ask(q) });
    } catch (err) {
      setResult(null);
      setError(errorMessage(err));
    } finally {
      setAsking(false);
    }
  }

  async function addMissing() {
    if (!result) return;
    setAdded(true);
    const created: string[] = [];
    for (const m of result.r.missing) {
      const item = await k.write(() => api.addListItem(m.genericProductId ? { genericProductId: m.genericProductId } : { freeText: m.name }));
      if (item) created.push(item.id);
    }
    const n = created.length;
    if (n)
      k.toast(`${n} ${n === 1 ? "item entrou" : "itens entraram"} na lista`, {
        undo: async () => {
          for (const id of created) await api.removeListItem(id);
          setAdded(false);
        },
      });
  }

  const r = result?.r;

  return (
    <div className="page">
      <div className="page-head page-head-start">
        <BackButton fallback="/" />
        <div className="head-grow">
          <h1 className="page-title">Perguntar à Governanta</h1>
          <div className="page-sub">Pergunte sobre o que tem em casa. A resposta usa a despensa de agora.</div>
        </div>
      </div>
      <div className="page-scroll ask-body">
        <form
          className="card ask-form"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <textarea
            className="ask-input"
            rows={2}
            maxLength={500}
            placeholder="ex.: dá para fazer panqueca com o que tem?"
            aria-label="Pergunta"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(question);
              }
            }}
          />
          <div className="ask-row">
            <div className="ask-chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip chip-sm" disabled={asking} onClick={() => void ask(s)}>
                  {s}
                </button>
              ))}
            </div>
            <button type="submit" className="btn btn-primary btn-md" disabled={asking || !question.trim()}>
              {asking ? "Pensando…" : "Perguntar"}
            </button>
          </div>
        </form>

        <div aria-live="polite">
          {asking && <div className="card ask-answer tone-muted">Olhando a despensa e pensando na resposta…</div>}
          {error && !asking && (
            <div className="info-box ask-error" role="alert">
              <Icon name="error" size={26} className="tone-bad" />
              {error}
            </div>
          )}
          {r && !asking && (
            <section className="card ask-answer">
              <Eyebrow>{result.q}</Eyebrow>
              {r.canMake != null && <span className={`tag${r.canMake ? " tag-ok" : ""}`}>{r.canMake ? "dá para fazer" : "falta alguma coisa"}</span>}
              <p className="ask-text">{r.answer}</p>
              {(r.have.length > 0 || r.missing.length > 0) && (
                <div className="ask-lists">
                  {r.have.length > 0 && (
                    <div>
                      <Eyebrow>Vocês têm</Eyebrow>
                      <ul>
                        {r.have.map((x) => (
                          <li key={x}>
                            <Icon name="check" size={24} className="tone-ok" />
                            {x}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {r.missing.length > 0 && (
                    <div>
                      <Eyebrow>Falta</Eyebrow>
                      <ul>
                        {r.missing.map((m) => (
                          <li key={m.name}>
                            <Icon name="remove" size={24} className="tone-subtle" />
                            {m.name}
                          </li>
                        ))}
                      </ul>
                      <button type="button" className="btn btn-primary" disabled={added} onClick={addMissing}>
                        {added ? "Faltantes na lista" : "Pôr os que faltam na lista"}
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="ask-foot num">
                {r.model} · {r.usage.inputTokens.toLocaleString("pt-BR")} + {r.usage.outputTokens.toLocaleString("pt-BR")} tokens
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
