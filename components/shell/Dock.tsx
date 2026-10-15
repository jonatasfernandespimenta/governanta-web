"use client";

import Link from "next/link";
import { Icon } from "../ui";

const NAV = [
  { href: "/", label: "Casa", icon: "home" },
  { href: "/lista", label: "Lista", icon: "checklist" },
  { href: "/previsoes", label: "Previsões", icon: "hourglass_bottom" },
  { href: "/planejar", label: "Planejar", icon: "event_upcoming" },
  { href: "/historico", label: "Histórico", icon: "receipt_long" },
] as const;

/** Aba ativa para cada rota (telas de detalhe acendem a aba de onde vieram). */
function activeTab(path: string): string {
  if (path.startsWith("/produto")) return "/previsoes";
  if (path.startsWith("/historico") || path.startsWith("/compras")) return "/historico";
  for (const n of NAV) if (n.href !== "/" && path.startsWith(n.href)) return n.href;
  return "/";
}

export function Dock({ pathname, offline, showVoice, onVoice }: { pathname: string; offline: boolean; showVoice: boolean; onVoice: () => void }) {
  const active = activeTab(pathname);
  return (
    <nav className="dock" aria-label="Navegação">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={`dock-tab${active === n.href ? " active" : ""}`} aria-current={active === n.href ? "page" : undefined}>
          <span className="dock-bar" />
          <Icon name={n.icon} size={32} />
          <span className="dock-label">{n.label}</span>
        </Link>
      ))}
      <div className="dock-spacer" />
      {offline && (
        <div className="dock-offline">
          <Icon name="cloud_off" size={22} />
          offline
        </div>
      )}
      {showVoice && (
        <button type="button" className="falar" onClick={onVoice}>
          <Icon name="mic" size={34} fill />
          <span>Falar</span>
        </button>
      )}
    </nav>
  );
}
