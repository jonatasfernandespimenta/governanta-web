// Configuração do módulo de voz. Trocar o modelo = mudar só VOICE_MODEL (e, se preciso, os dtypes).
// Escolha (EXP-001, baseline desktop): whisper-base. WebGPU fp32 → RTF 0,28; sem WebGPU, WASM q8 (80 MB).

/** Modelo Whisper (ONNX, Hugging Face Hub). */
export const VOICE_MODEL = "onnx-community/whisper-base";

/** Quantização por backend: WebGPU quando `navigator.gpu` tem adaptador, senão WASM. */
export const VOICE_DTYPE = { webgpu: "fp32", wasm: "q8" } as const;

/** Worker + runtime vendorizado (public/voice). */
export const VOICE_WORKER_URL = "/voice/worker.js";

export const SAMPLE_RATE = 16000;

/** VAD por energia (RMS). */
export const VAD = {
  /** Limiar mínimo de RMS para considerar voz (sobe com o ruído de fundo, até maxThreshold). */
  threshold: 0.02,
  /** Teto do limiar adaptativo. */
  maxThreshold: 0.05,
  /** Silêncio após a fala para parar. */
  silenceMs: 700,
  /** Duração máxima da escuta. */
  maxMs: 8000,
  /** Sem nenhuma fala até aqui → para (resultado vazio / "unknown"). */
  noSpeechMs: 5000,
  /** Silêncio acrescentado antes/depois do áudio (sem isso o Whisper come a 1ª sílaba; EXP-001). */
  padMs: 300,
  /** Janelas de 30 ms acima do limiar necessárias para contar como fala (ignora estalos). */
  minVoicedFrames: 3,
  frameMs: 30,
} as const;
