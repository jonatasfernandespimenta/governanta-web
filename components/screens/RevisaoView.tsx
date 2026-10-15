"use client";

// 09 Revisão NFC-e: o que foi reconhecido sozinho, um a um os itens a confirmar, e "Compra registrada".

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, type Product, type ReceiptConfirmResult, type ReceiptDecision, type ReceiptLine, type ReceiptToConfirm } from "@/lib/api";
import { capitalize, money, qtyLabel } from "@/lib/format";
import { useResource } from "@/lib/useResource";
import { useKiosk } from "../shell/context";
import { BackButton, Eyebrow, Icon, ResultState } from "../ui";

const AUTO_SHOWN = 6;

/** "1,215 kg × R$ 6,99" ou "1 × R$ 21,49" */
function lineQty(l: ReceiptLine): string {
  const unit = l.unit?.toLowerCase();
  const q = unit === "kg" || unit === "g" || unit === "l" || unit === "ml" ? qtyLabel(l.quantity, unit) : l.quantity.toLocaleString("pt-BR");
  return `${q} × ${money(l.unitPriceCents)}`;
}

/** Nome sugerido para um produto novo a partir da descrição da nota ("PAO FORMA INTEGRAL 480G"). */
function titleCase(desc: string): string {
  const s = desc.toLowerCase().replace(/(\d)(g|kg|ml|l)\b/g, "$1 $2");
  return capitalize(s);
}

type Choice = { label: string; decision: Omit<ReceiptDecision, "lineId"> };

function defaultChoice(l: ReceiptToConfirm): Choice {
  if (l.suggestion) return { label: l.suggestion.name, decision: { genericProductId: l.suggestion.genericProductId } };
  // Produto novo: a API já propõe um nome limpo; sem ele, a descrição da nota em caixa normal.
  const name = l.name ?? titleCase(l.description);
  return { label: name, decision: { newName: name } };
}

export function RevisaoView({ id }: { id: string }) {
  const k = useKiosk();
  const router = useRouter();
  const review = useResource((s) => api.getReceiptReview(id, s), 10 * 60_000);
  const [idx, setIdx] = useState(0);
  const [chosen, setChosen] = useState<Record<string, Choice>>({});
  const [correcting, setCorrecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<ReceiptConfirmResult | null>(null);

  const r = review.data;
  useEffect(() => {
    if (r?.receipt.status === "confirmed" && !done) router.replace(`/compras/${id}`);
  }, [r, done, id, router]);

  if (!r) {
    return (
      <div className="page">
        <Head />
        <div className="center-body tone-muted">{review.error ? "Não encontrei esta nota." : "Carregando a nota…"}</div>
      </div>
    );
  }

  const list = r.toConfirm;
  const cur = list[Math.min(idx, list.length - 1)];
  const all = idx >= list.length;
  const choiceFor = (l: ReceiptToConfirm) => chosen[l.id] ?? defaultChoice(l);

  function decide(c: Choice) {
    setChosen((m) => ({ ...m, [cur.id]: c }));
    setCorrecting(false);
    setIdx((i) => i + 1);
  }

  async function register() {
    setSaving(true);
    const decisions = list.map((l) => ({ lineId: l.id, ...choiceFor(l).decision }));
    const res = await k.write(() => api.confirmReceipt(id, decisions));
    setSaving(false);
    if (res) setDone(res);
  }

  if (done) {
    return (
      <div className="page">
        <Head />
        <ResultState
          icon="check"
          tone="ok"
          title="Compra registrada"
          actions={
            <>
              <Link href={`/compras/${id}`} className="btn btn-outline btn-lg">
                Ver compra
              </Link>
              <Link href="/" className="btn btn-primary btn-lg">
                Voltar para Casa
              </Link>
            </>
          }
        >
          <div className="done-total num">
            {done.purchased} produtos · {money(done.totalCents)}
          </div>
          <div className="done-notes">
            {done.newProducts.length > 0 && (
              <div>
                {done.newProducts.length === 1 ? "1 produto novo cadastrado" : `${done.newProducts.length} produtos novos cadastrados`}: {done.newProducts.join(", ")}
              </div>
            )}
            {done.listItemsPurchased.length > 0 && (
              <div>
                {done.listItemsPurchased.length === 1 ? "1 item da lista marcado como comprado" : `${done.listItemsPurchased.length} itens da lista marcados como comprados`}:{" "}
                {done.listItemsPurchased.map((n) => n.toLowerCase()).join(", ")}
              </div>
            )}
          </div>
        </ResultState>
      </div>
    );
  }

  const ignored = list.filter((l) => chosen[l.id]?.decision.ignore).length;
  const count = r.receipt.itemCount - ignored;

  return (
    <div className="page">
      <Head />
      <div className="page-body review-grid">
        <section className="card review-auto">
          <div className="review-auto-head">
            <Icon name="check" size={26} />
            {r.autoMatched.length} {r.autoMatched.length === 1 ? "reconhecido" : "reconhecidos"} automaticamente
          </div>
          <div className="review-lines">
            {r.autoMatched.slice(0, AUTO_SHOWN).map((l) => (
              <div key={l.id} className="review-line">
                <span>
                  {l.name ?? l.description}
                  {l.quantity !== 1 || l.unit === "kg" ? ` · ${lineQty(l).split(" × ")[0]}` : ""}
                </span>
                <span className="num tone-muted">{money(l.totalCents)}</span>
              </div>
            ))}
          </div>
          {r.autoMatched.length > AUTO_SHOWN && <div className="review-more">e mais {r.autoMatched.length - AUTO_SHOWN} itens</div>}
          <div className="flex-1" />
          {list.length > 0 && (
            <>
              <Eyebrow className="review-pending-title">Para confirmar</Eyebrow>
              <div className="review-pending">
                {list.map((l, i) => (
                  <div key={l.id} className="review-pending-row">
                    {i < idx ? (
                      <>
                        <Icon name={chosen[l.id]?.decision.ignore ? "block" : "check"} size={24} className={chosen[l.id]?.decision.ignore ? "tone-subtle" : "tone-ok"} />
                        <span>{choiceFor(l).label}</span>
                      </>
                    ) : i === idx ? (
                      <>
                        <span className="pend-dot cur" />
                        <span className="strong">{choiceFor(l).label}</span>
                      </>
                    ) : (
                      <>
                        <span className="pend-dot" />
                        <span className="tone-subtle">{l.description}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {all ? (
          <section className="card review-done">
            <div className="review-done-title">Tudo conferido.</div>
            <div className="review-done-text">
              {count} produtos · {money(r.receipt.totalCents)}.{" "}
              {r.listMatches.length > 0 ? "Itens da lista que estavam nesta nota serão marcados como comprados." : "Nenhum item da lista estava nesta nota."}
            </div>
            <div className="row-gap review-done-actions">
              {list.length > 0 && (
                <button type="button" className="btn btn-outline btn-lg" onClick={() => setIdx(list.length - 1)}>
                  Voltar
                </button>
              )}
              <button type="button" className="btn btn-primary btn-xl" disabled={saving} onClick={register}>
                {saving ? "Registrando…" : "Registrar compra"}
              </button>
            </div>
          </section>
        ) : (
          <ConfirmCard
            key={cur.id}
            line={cur}
            pos={idx + 1}
            total={list.length}
            correcting={correcting}
            onCorrect={() => setCorrecting((c) => !c)}
            onConfirm={() => decide(defaultChoice(cur))}
            onPick={decide}
          />
        )}
      </div>
    </div>
  );
}

function Head() {
  return (
    <div className="page-head page-head-start">
      <BackButton fallback="/escanear" />
      <h1 className="page-title page-title-detail head-grow">Registrar compra</h1>
      <div className="head-note">Nota fiscal (NFC-e)</div>
    </div>
  );
}

function ConfirmCard({
  line,
  pos,
  total,
  correcting,
  onCorrect,
  onConfirm,
  onPick,
}: {
  line: ReceiptToConfirm;
  pos: number;
  total: number;
  correcting: boolean;
  onCorrect: () => void;
  onConfirm: () => void;
  onPick: (c: Choice) => void;
}) {
  const guess = defaultChoice(line);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Product[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!correcting) return;
    inputRef.current?.focus();
    const term = q.trim();
    if (!term) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api
        .searchProducts(term, ctrl.signal)
        .then((p) => setFound(p.slice(0, 3)))
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, correcting]);

  const newName = line.name ?? titleCase(line.description);
  const typed = capitalize(q.trim());

  return (
    <section className="card review-card">
      <div className="row-between">
        <Eyebrow>
          Confirmar {pos} de {total}
        </Eyebrow>
        {line.isNew && <span className="tag tag-dashed">produto novo</span>}
      </div>
      <div className="review-raw mono">{line.description}</div>
      <div className="review-guess-label">{line.isNew ? "Vou cadastrar como:" : "Achamos que é:"}</div>
      <div className="review-guess">{guess.label}</div>
      <div className="review-qty num">{lineQty(line)}</div>
      {correcting && (
        <div className="review-alts">
          <input ref={inputRef} className="alt-search" placeholder={line.isNew ? "Buscar ou escrever o nome…" : "Buscar outro produto…"} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar outro produto" />
          {q.trim() &&
            found.map((p) => (
              <button key={p.id} type="button" className="alt" onClick={() => onPick({ label: capitalize(p.name), decision: { genericProductId: p.id } })}>
                {capitalize(p.name)}
              </button>
            ))}
          {(q.trim() || !line.isNew) && (
            <button type="button" className="alt" onClick={() => onPick({ label: typed || newName, decision: { newName: typed || newName } })}>
              Cadastrar como novo: {typed || newName}
            </button>
          )}
          <button type="button" className="alt alt-muted" onClick={() => onPick({ label: `${line.description} (ignorado)`, decision: { ignore: true } })}>
            Não registrar este item
          </button>
        </div>
      )}
      {!correcting && <div className="flex-1" />}
      <div className="row-gap row-end">
        <button type="button" className="btn btn-outline btn-lg" onClick={onCorrect}>
          {correcting ? "Cancelar" : "Corrigir"}
        </button>
        <button type="button" className="btn btn-primary btn-lg" onClick={onConfirm}>
          Confirmar
        </button>
      </div>
    </section>
  );
}
