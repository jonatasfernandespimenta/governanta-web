"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isModelReady, isVoiceSupported, loadModel, openMic, recordUtterance, transcribe, VoiceError } from "./engine";
import { cleanTranscript, parseCommand } from "./parse";
import type { VoiceState } from "./types";

const noopSubscribe = () => () => {};

/**
 * Comando de voz do quiosque. `start()` (num toque): carrega o modelo na 1ª vez (`loading-model`),
 * escuta com VAD (`listening`, para sozinho; máx. 8 s), transcreve no worker (`transcribing`) e entrega
 * `result` com o texto e os intents. `cancel()` volta para `idle` de qualquer fase (também fecha
 * `result`/`error`). A voz não desenha telas: a UI renderiza a partir de `state`.
 */
export function useVoice(): { state: VoiceState; start(): void; cancel(): void; supported: boolean } {
  const [state, setState] = useState<VoiceState>({ phase: "idle" });
  const supported = useSyncExternalStore(noopSubscribe, isVoiceSupported, () => false);
  const session = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    session.current?.abort();
    session.current = null;
    setState({ phase: "idle" });
  }, []);

  const start = useCallback(() => {
    if (session.current) return; // já está carregando/ouvindo/transcrevendo
    if (!isVoiceSupported()) {
      setState({ phase: "error", reason: "unsupported" });
      return;
    }
    const ac = new AbortController();
    session.current = ac;
    const alive = () => session.current === ac && !ac.signal.aborted;
    const set = (s: VoiceState) => {
      if (alive()) setState(s);
    };
    // Criado dentro do toque (gesto do usuário) para não nascer suspenso.
    const ctx = new AudioContext();
    let stream: MediaStream | null = null;

    (async () => {
      try {
        const mic = openMic();
        mic.catch(() => {});
        if (!isModelReady()) {
          set({ phase: "loading-model", progress: 0 });
          await Promise.all([mic, loadModel((progress) => set({ phase: "loading-model", progress }))]);
        }
        stream = await mic;
        if (!alive()) return;

        set({ phase: "listening", level: 0 });
        let lastLevel = 0;
        let lastAt = 0;
        const audio = await recordUtterance(stream, ctx, {
          signal: ac.signal,
          onLevel: (level) => {
            const now = performance.now();
            if (Math.abs(level - lastLevel) > 0.02 && now - lastAt > 50) {
              lastLevel = level;
              lastAt = now;
              set({ phase: "listening", level });
            }
          },
        });
        stream.getTracks().forEach((t) => t.stop());
        if (!alive()) return;
        if (!audio) {
          set({ phase: "result", text: "", intents: parseCommand("") });
          return;
        }
        set({ phase: "transcribing" });
        const text = cleanTranscript(await transcribe(audio));
        set({ phase: "result", text, intents: parseCommand(text) });
      } catch (err) {
        const reason = err instanceof VoiceError ? err.reason : "model-failed";
        if (!(err instanceof VoiceError)) console.error("[voice]", err);
        set({ phase: "error", reason });
      } finally {
        stream?.getTracks().forEach((t) => t.stop());
        void ctx.close().catch(() => {});
        if (session.current === ac) session.current = null;
      }
    })();
  }, []);

  useEffect(() => () => session.current?.abort(), []);

  return { state, start, cancel, supported };
}
