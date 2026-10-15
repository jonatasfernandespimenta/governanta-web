"use client";

// Moldura do quiosque: guarda o que é global (folha de produto, aviso com Desfazer, voz, diálogo de
// sincronização, fila de escritas que falharam) e desenha a barra de baixo.

import { usePathname, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { api, ApiError, getConnection, isRetryable, isUnauthorized, requestRetry, saveToken, subscribeAuth, subscribeConnection, type Household } from "@/lib/api";
import { useResource } from "@/lib/useResource";
import { Icon } from "../ui";
import { Dock } from "./Dock";
import { KioskContext, type Kiosk, type SheetKind, type ToastOpts } from "./context";
import { ProductSheet } from "./ProductSheet";
import { VoiceOverlay } from "./VoiceOverlay";

const TOAST_MS = 5000;
const RETRY_MS = 120_000;

type Toast = { id: number; text: string } & ToastOpts;

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  const off = subscribeConnection(cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
    off();
  };
}
const isOffline = () => !navigator.onLine || getConnection() === "offline";

function errorText(err: unknown): string {
  if (err instanceof ApiError && err.status === 404) return "Não encontrei esse item. A tela foi atualizada.";
  return "Não deu certo. Tente de novo.";
}

function isNight(d = new Date()) {
  const h = d.getHours();
  return h >= 22 || h < 6;
}

export function KioskProvider({ children }: { children: ReactNode }) {
  const offline = useSyncExternalStore(subscribeOnline, isOffline, () => false);
  const needsKey = useSyncExternalStore(subscribeAuth, isUnauthorized, () => false);
  const hh = useResource((s) => api.getHousehold(s), 5 * 60_000);
  const household = hh.data;

  // ---------- Aviso (toast) com Desfazer ----------
  const [toastState, setToastState] = useState<Toast | null>(null);
  const toastRef = useRef<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);

  // ---------- Fila de escritas e diálogo ----------
  const outbox = useRef<(() => Promise<unknown>)[]>([]);
  const [dialog, setDialog] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const toastFn = useRef<(text: string) => void>(() => {});

  const write = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      const r = await fn();
      requestRetry();
      return r;
    } catch (err) {
      if (isRetryable(err)) {
        outbox.current.push(fn);
        setDialog(true);
      } else {
        // `toast` depende de `write` (para gravar o pendente); por isso o aviso de erro vai pela ref.
        toastFn.current(errorText(err));
        requestRetry();
      }
      return undefined;
    }
  }, []);

  const flush = useCallback(async () => {
    const pending = outbox.current.splice(0);
    for (const fn of pending) {
      try {
        await fn();
      } catch (err) {
        if (isRetryable(err)) outbox.current.push(fn);
      }
    }
    requestRetry();
    return outbox.current.length === 0;
  }, []);

  useEffect(() => {
    const tick = () => {
      if (outbox.current.length) void flush();
    };
    const timer = setInterval(tick, RETRY_MS);
    window.addEventListener("online", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", tick);
    };
  }, [flush]);

  const finishToast = useCallback(
    (t: Toast | null) => {
      if (t?.commit) void write(t.commit);
    },
    [write],
  );

  const hideToast = useCallback(() => {
    clearTimeout(toastTimer.current);
    toastRef.current = null;
    setToastState(null);
  }, []);

  const toast = useCallback(
    (text: string, opts: ToastOpts = {}) => {
      // Um aviso novo confirma o anterior (se ele tinha algo pendente).
      finishToast(toastRef.current);
      clearTimeout(toastTimer.current);
      const t: Toast = { id: ++seq.current, text, ...opts };
      toastRef.current = t;
      setToastState(t);
      toastTimer.current = setTimeout(() => {
        if (toastRef.current?.id !== t.id) return;
        finishToast(t);
        hideToast();
      }, TOAST_MS);
    },
    [finishToast, hideToast],
  );

  useEffect(() => {
    toastFn.current = (text) => toast(text);
  }, [toast]);

  const undoToast = useCallback(() => {
    const t = toastRef.current;
    hideToast();
    if (t?.undo) void write(t.undo);
  }, [hideToast, write]);

  // Fechar a aba não pode perder uma ação ainda pendente.
  useEffect(() => {
    const onHide = () => finishToast(toastRef.current);
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [finishToast]);

  // ---------- Folha de produto ----------
  const [sheet, setSheet] = useState<{ kind: SheetKind; query: string; key: number } | null>(null);
  const openSheet = useCallback((kind: SheetKind, query = "") => setSheet({ kind, query, key: Date.now() }), []);

  // ---------- Voz ----------
  // Chamado direto no toque: o áudio do navegador só nasce ativo dentro de um gesto do usuário.
  const voiceStart = useRef<() => void>(() => {});
  const startVoice = useCallback(() => {
    setSheet(null);
    voiceStart.current();
  }, []);

  // ---------- Escurecer à noite ----------
  const [night, setNight] = useState(false);
  useEffect(() => {
    const check = () => setNight(isNight());
    const first = setTimeout(check, 0);
    const timer = setInterval(check, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const value = useMemo<Kiosk>(
    () => ({ openSheet, toast, startVoice, write, household, reloadHousehold: hh.reload, offline }),
    [openSheet, toast, startVoice, write, household, hh.reload, offline],
  );

  const voiceAlways = household?.prefs.voiceButtonAlwaysVisible ?? true;

  return (
    <KioskContext.Provider value={value}>
      <div className="app">
        <main className="screen">{children}</main>
        {/* A rota só é conhecida no aparelho nas telas com id: a barra espera por ela sem travar a página. */}
        <Suspense fallback={<Dock pathname="" offline={offline} showVoice={voiceAlways} onVoice={startVoice} />}>
          <RouteChrome household={household} offline={offline} voiceAlways={voiceAlways} onVoice={startVoice} />
        </Suspense>

        {toastState && (
          <div className="toast" role="status" key={toastState.id}>
            <Icon name="check" size={28} />
            <span className="toast-text">{toastState.text}</span>
            {(toastState.undo || toastState.commit) && (
              <button type="button" className="toast-undo" onClick={undoToast}>
                Desfazer
              </button>
            )}
          </div>
        )}

        {sheet && <ProductSheet key={sheet.key} kind={sheet.kind} initialQuery={sheet.query} onClose={() => setSheet(null)} onVoice={startVoice} />}

        {dialog && (
          <div className="scrim scrim-dialog">
            <div className="dialog" role="alertdialog" aria-labelledby="sync-title">
              <Icon name="wifi_off" size={48} className="tone-bad" />
              <div id="sync-title" className="dialog-title">
                Não consegui sincronizar agora
              </div>
              <div className="dialog-text">A lista continua salva neste tablet. Vou tentar de novo sozinha em alguns minutos.</div>
              <div className="dialog-actions">
                <button type="button" className="btn btn-outline btn-md" onClick={() => setDialog(false)}>
                  Fechar
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-md"
                  disabled={retrying}
                  onClick={async () => {
                    setRetrying(true);
                    const ok = await flush();
                    setRetrying(false);
                    if (ok) setDialog(false);
                  }}
                >
                  {retrying ? "Tentando…" : "Tentar agora"}
                </button>
              </div>
            </div>
          </div>
        )}

        {needsKey && <KeyDialog />}

        <VoiceOverlay startRef={voiceStart} />

        {night && household?.prefs.dimAtNight && <div className="night-dim" aria-hidden />}
      </div>
    </KioskContext.Provider>
  );
}

/** Partes que dependem da rota: a barra de baixo e o desvio para a configuração inicial. */
function RouteChrome({ household, offline, voiceAlways, onVoice }: { household: Household | undefined; offline: boolean; voiceAlways: boolean; onVoice: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const redirected = useRef(false);
  useEffect(() => {
    if (!household || household.onboardedAt || redirected.current || pathname === "/onboarding") return;
    redirected.current = true;
    router.replace("/onboarding");
  }, [household, pathname, router]);
  if (pathname === "/onboarding") return null;
  return <Dock pathname={pathname} offline={offline} showVoice={voiceAlways || pathname === "/"} onVoice={onVoice} />;
}

/** A API pediu o código da casa (HOUSEHOLD_TOKEN) e este aparelho não tem ou tem um antigo. */
function KeyDialog() {
  const [key, setKey] = useState("");
  return (
    <div className="scrim scrim-dialog">
      <form
        className="dialog"
        role="alertdialog"
        aria-labelledby="key-title"
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim()) saveToken(key.trim());
        }}
      >
        <Icon name="key" size={48} className="tone-muted" />
        <div id="key-title" className="dialog-title">
          Este aparelho precisa do código da casa
        </div>
        <div className="dialog-text">É o HOUSEHOLD_TOKEN configurado na API. Digite uma vez: fica guardado só neste aparelho.</div>
        <input className="key-input" type="password" autoComplete="off" aria-label="Código da casa" value={key} onChange={(e) => setKey(e.target.value)} autoFocus />
        <div className="dialog-actions">
          <button type="submit" className="btn btn-primary btn-md" disabled={!key.trim()}>
            Salvar código
          </button>
        </div>
      </form>
    </div>
  );
}
