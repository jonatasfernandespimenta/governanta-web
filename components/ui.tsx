"use client";

// Peças visuais compartilhadas pelas telas do quiosque.

import { useRouter } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import type { ListReason } from "@/lib/api";

/** Ícone Material Symbols Outlined (fonte servida pelo próprio app). `size` em px do desenho. */
export function Icon({ name, size = 30, fill = false, className }: { name: string; size?: number; fill?: boolean; className?: string }) {
  return (
    <span aria-hidden className={`i${fill ? " i-fill" : ""}${className ? ` ${className}` : ""}`} style={{ "--is": size } as CSSProperties}>
      {name}
    </span>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`eyebrow${className ? ` ${className}` : ""}`}>{children}</div>;
}

/** Botão redondo de voltar: volta no histórico; aberta direto, vai para `fallback`. */
export function BackButton({ fallback }: { fallback: string }) {
  const router = useRouter();
  return (
    <button type="button" className="round-btn" aria-label="Voltar" onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}>
      <Icon name="arrow_back" />
    </button>
  );
}

/** Origem do item: acabou (cheio), previsto (tracejado), adicionado (anel). */
export type Origin = "falt" | "prev" | "man";

export function originOf(reason: ListReason): Origin {
  if (reason === "forecast") return "prev";
  if (reason === "manual") return "man";
  return "falt";
}

export function OriginDot({ origin, size = 16 }: { origin: Origin; size?: number }) {
  return <span aria-hidden className={`dot dot-${origin}`} style={{ "--d": size } as CSSProperties} />;
}

/** Selo verde "na lista". */
export function OnListBadge({ children = "na lista", size = "sm" }: { children?: ReactNode; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`badge-ok badge-ok-${size}`}>
      <Icon name="check" size={size === "sm" ? 22 : size === "md" ? 24 : 26} />
      {children}
    </span>
  );
}

/** Estado vazio com o ícone num círculo tracejado. */
export function EmptyState({ icon, title, children, actions }: { icon: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-ring">
        <Icon name={icon} size={48} />
      </div>
      <div className="empty-title">{title}</div>
      {children && <div className="empty-text">{children}</div>}
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  );
}

/** Página simples centralizada para estados de resultado (sucesso/erro) com círculo grande. */
export function ResultState({
  icon,
  tone,
  title,
  children,
  actions,
}: {
  icon: string;
  tone: "ok" | "bad" | "muted";
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="result">
      <div className={`result-ring result-${tone}`}>
        <Icon name={icon} size={tone === "ok" ? 64 : 56} />
      </div>
      <div className="result-title">{title}</div>
      {children && <div className="result-text">{children}</div>}
      {actions && <div className="result-actions">{actions}</div>}
    </div>
  );
}

/** Esqueleto de carregamento: barras cinzas com larguras dadas. */
export function Skeleton({ label, widths }: { label: string; widths: number[] }) {
  return (
    <div className="card skeleton" aria-busy>
      <Eyebrow>{label}</Eyebrow>
      {widths.map((w, i) => (
        <div key={i} className="sk-bar" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

/** Interruptor liga/desliga do desenho (76 × 44). */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle${on ? " on" : ""}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

/**
 * Barras verticais simples (preços, semanas), alinhadas pela base, com o valor logo acima de cada barra.
 * A altura máxima vem de `--bar-max` (definida pela tela). A atual pode ser destacada.
 */
export function Bars({
  bars,
  className,
}: {
  bars: { key: string; top: string; label: string; value: number; current?: boolean; hatched?: boolean }[];
  className?: string;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className={`bars${className ? ` ${className}` : ""}`} style={{ "--n": bars.length } as CSSProperties}>
      {bars.map((b) => (
        <div key={b.key} className={`bar-col${b.current ? " current" : ""}`}>
          <span className="num">{b.top}</span>
          <div className={`bar${b.hatched ? " hatched" : ""}`} style={{ height: `calc(${Math.max(0.04, b.value / max).toFixed(3)} * var(--bar-max))` }} />
          <span className="bar-label">{b.label}</span>
        </div>
      ))}
    </div>
  );
}
