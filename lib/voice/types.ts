// Tipos públicos do módulo de voz (contrato do quiosque, seção "Voz").

/** Unidades aceitas pela API em itens da lista. */
export type VoiceUnit = "g" | "kg" | "ml" | "l" | "un" | "dz" | "pct";

export type VoiceIntent =
  | { kind: "depleted"; product: string }
  | { kind: "add_to_list"; product: string; quantity?: number; unit?: string }
  | { kind: "remove_from_list"; product: string }
  // `unit` é extensão aditiva ao contrato: só vem em "usei 200 g de queijo" (peso/volume).
  | { kind: "used"; product: string; quantity?: number; fraction?: number; unit?: string }
  | { kind: "cancel" }
  | { kind: "unknown"; text: string };

export type VoiceErrorReason = "mic-denied" | "mic-unavailable" | "model-failed" | "unsupported";

export type VoiceState =
  | { phase: "idle" }
  | { phase: "loading-model"; progress: number }
  | { phase: "listening"; level: number }
  | { phase: "transcribing" }
  | { phase: "result"; text: string; intents: VoiceIntent[] }
  | { phase: "error"; reason: VoiceErrorReason };

/** Produto como vem de GET /products?q= (campos extras da API são preservados). */
export type VoiceProduct = {
  id: string;
  name: string;
  unit?: string | null;
  location?: string | null;
  onList?: boolean;
};

export type ResolveResult =
  | { status: "one"; product: VoiceProduct }
  | { status: "many"; candidates: VoiceProduct[] }
  | { status: "none" };
