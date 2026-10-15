// Módulo de voz do quiosque (contrato: seção "Voz"). Importe daqui: `import { useVoice, resolveProduct } from "@/lib/voice"`.
export type { VoiceIntent, VoiceState, VoiceErrorReason, VoiceProduct, ResolveResult, VoiceUnit } from "./types";
export { useVoice } from "./useVoice";
export { parseCommand, cleanTranscript, GRAMMAR_VERSION } from "./parse";
export { resolveProduct } from "./resolve";
export { loadModel as preloadVoiceModel, isModelReady, isVoiceSupported } from "./engine";
export { VOICE_MODEL } from "./config";
