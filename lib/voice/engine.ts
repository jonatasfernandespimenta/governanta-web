// Motor de voz sem React: worker do Whisper (singleton por aba), microfone, VAD e reamostragem 16 kHz.
// Só roda no browser.

import { SAMPLE_RATE, VAD, VOICE_DTYPE, VOICE_MODEL, VOICE_WORKER_URL } from "./config";
import type { VoiceErrorReason } from "./types";

export class VoiceError extends Error {
  reason: VoiceErrorReason;
  constructor(reason: VoiceErrorReason, message?: string) {
    super(message ?? reason);
    this.reason = reason;
  }
}

export function isVoiceSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof Worker !== "undefined" &&
    typeof WebAssembly === "object" &&
    typeof MediaRecorder !== "undefined" &&
    typeof AudioContext !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

// ---------- worker / modelo ----------

type Pending = { resolve: (text: string) => void; reject: (e: Error) => void };
type WorkerMsg =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready"; device?: string; dtype?: string; loadMs?: number; warmupMs?: number }
  | { type: "result"; id: number; text: string; ms: number }
  | { type: "error"; id?: number; message: string };

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let isReady = false;
let progress = 0;
let nextId = 1;
let loadWaiter: { resolve: () => void; reject: (e: Error) => void } | null = null;
const pending = new Map<number, Pending>();
const progressListeners = new Set<(p: number) => void>();

/** Informações do último carregamento (backend escolhido, tempos). Útil para diagnóstico. */
export let modelInfo: { device?: string; dtype?: string; loadMs?: number; warmupMs?: number } | null = null;

function failAll(err: Error) {
  loadWaiter?.reject(err);
  loadWaiter = null;
  for (const p of pending.values()) p.reject(err);
  pending.clear();
  worker?.terminate();
  worker = null;
  ready = null;
  isReady = false;
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(VOICE_WORKER_URL, { type: "module" });
  w.onmessage = ({ data }: MessageEvent<WorkerMsg>) => {
    if (data.type === "progress") {
      // Só arquivos grandes (encoder/decoder) contam; os JSON pequenos chegariam a 100% antes.
      if (data.total > 1e6) {
        progress = Math.max(progress, Math.min(0.99, data.loaded / data.total));
        for (const l of progressListeners) l(progress);
      }
    } else if (data.type === "ready") {
      isReady = true;
      progress = 1;
      if (data.device) modelInfo = { device: data.device, dtype: data.dtype, loadMs: data.loadMs, warmupMs: data.warmupMs };
      loadWaiter?.resolve();
      loadWaiter = null;
    } else if (data.type === "result") {
      pending.get(data.id)?.resolve(data.text);
      pending.delete(data.id);
    } else if (data.type === "error") {
      const err = new VoiceError("model-failed", data.message);
      if (data.id !== undefined && pending.has(data.id)) {
        pending.get(data.id)!.reject(err);
        pending.delete(data.id);
      } else {
        failAll(err);
      }
    }
  };
  w.onerror = (e) => failAll(new VoiceError("model-failed", e.message || "worker error"));
  worker = w;
  return w;
}

export function isModelReady(): boolean {
  return isReady;
}

/**
 * Carrega o modelo uma vez por aba (os arquivos ficam no Cache API e sobrevivem a reloads).
 * Pode ser chamado de novo: devolve a mesma promessa. Em falha, a próxima chamada tenta de novo.
 */
export function loadModel(onProgress?: (p: number) => void): Promise<void> {
  if (onProgress) progressListeners.add(onProgress);
  if (!ready) {
    progress = 0;
    ready = new Promise<void>((resolve, reject) => {
      loadWaiter = { resolve, reject };
      getWorker().postMessage({
        type: "load",
        model: VOICE_MODEL,
        webgpu: { dtype: VOICE_DTYPE.webgpu },
        wasm: { dtype: VOICE_DTYPE.wasm },
      });
    });
    navigator.storage?.persist?.().catch(() => {});
  }
  const p = ready;
  return p.finally(() => {
    if (onProgress) progressListeners.delete(onProgress);
  });
}

/** Transcreve áudio 16 kHz mono (o buffer é transferido para o worker). */
export async function transcribe(audio: Float32Array): Promise<string> {
  await loadModel();
  const id = nextId++;
  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ type: "transcribe", id, audio }, [audio.buffer]);
  });
}

// ---------- áudio ----------

/** Pede o microfone. Erros viram VoiceError('mic-denied' | 'mic-unavailable' | 'unsupported'). */
export async function openMic(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new VoiceError("unsupported");
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    const name = (err as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") throw new VoiceError("mic-denied", name);
    throw new VoiceError("mic-unavailable", name);
  }
}

/** Qualquer áudio (webm/opus, wav...) → Float32Array 16 kHz mono, com `padMs` de silêncio antes e depois. */
export async function decodeTo16k(data: ArrayBuffer, ctx?: BaseAudioContext): Promise<Float32Array> {
  const own = ctx ? null : new AudioContext();
  const decoded = await (ctx ?? own!).decodeAudioData(data);
  void own?.close();
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE)), SAMPLE_RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination); // downmix automático para mono
  src.start();
  const raw = (await off.startRendering()).getChannelData(0);
  const pad = Math.round((VAD.padMs * SAMPLE_RATE) / 1000);
  const out = new Float32Array(raw.length + 2 * pad);
  out.set(raw, pad);
  return out;
}

/**
 * Grava uma fala com VAD por energia: para após `silenceMs` de silêncio depois da fala, ou em `maxMs`,
 * ou em `noSpeechMs` sem fala. Devolve o áudio 16 kHz (com padding) ou null se não houve fala/foi abortado.
 */
export async function recordUtterance(
  stream: MediaStream,
  ctx: AudioContext,
  opts: { onLevel?: (level: number) => void; signal?: AbortSignal } = {},
): Promise<Float32Array | null> {
  if (opts.signal?.aborted) return null;
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  const source = ctx.createMediaStreamSource(stream);
  source.connect(analyser);
  const mr = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  mr.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const buf = new Float32Array(analyser.fftSize);
  const t0 = performance.now();
  let floor: number = VAD.threshold;
  let lastVoice = 0;
  let voiced = 0;
  const stopped = new Promise<void>((r) => (mr.onstop = () => r()));
  const stop = () => {
    clearInterval(timer);
    if (mr.state !== "inactive") mr.stop();
  };
  opts.signal?.addEventListener("abort", stop, { once: true });

  mr.start();
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    const rms = Math.sqrt(sum / buf.length);
    const now = performance.now();
    // Ruído de fundo = menor RMS visto até agora. O limiar sobe com ele (cozinha barulhenta), mas com
    // teto: se a pessoa já começa falando, o "piso" medido é voz e não pode calar o VAD.
    floor = Math.min(floor, rms);
    const thr = Math.min(VAD.maxThreshold, Math.max(VAD.threshold, floor * 3));
    if (rms > thr) {
      voiced++;
      lastVoice = now;
    }
    opts.onLevel?.(Math.min(1, rms / 0.1));
    const spoke = voiced >= VAD.minVoicedFrames;
    if ((spoke && now - lastVoice > VAD.silenceMs) || now - t0 > VAD.maxMs || (!spoke && now - t0 > VAD.noSpeechMs)) stop();
  }, VAD.frameMs);

  await stopped;
  source.disconnect();
  if (opts.signal?.aborted || voiced < VAD.minVoicedFrames || !chunks.length) return null;
  const blob = new Blob(chunks, { type: mr.mimeType });
  return decodeTo16k(await blob.arrayBuffer(), ctx);
}
