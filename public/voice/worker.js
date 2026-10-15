// Worker de voz do Governanta: carrega o Whisper (transformers.js 4.3.0 / ONNX Runtime Web) e transcreve
// fora da thread de UI. Protocolo (ver web/lib/voice/engine.ts):
//   → { type: 'load', model, webgpu: { dtype }, wasm: { dtype } }
//   ← { type: 'progress', loaded, total }  ← { type: 'ready', device, dtype, loadMs, warmupMs }
//   → { type: 'transcribe', id, audio: Float32Array (16 kHz mono) }
//   ← { type: 'result', id, text, ms }      ← { type: 'error', id?, message }
import { env, pipeline } from './vendor/transformers.min.js';

env.allowLocalModels = false; // modelos vêm do Hugging Face Hub...
env.useBrowserCache = true; // ...e ficam no Cache API ("transformers-cache"): sobrevivem a reloads
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL('./vendor/ort-wasm-simd-threaded.asyncify.mjs', import.meta.url).href,
  wasm: new URL('./vendor/ort-wasm-simd-threaded.asyncify.wasm', import.meta.url).href,
};
// Threads só com crossOriginIsolated (SharedArrayBuffer). Sem isso o ORT cai para 1 thread sozinho.
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated
  ? Math.max(1, Math.min(4, Math.ceil((navigator.hardwareConcurrency || 2) / 2)))
  : 1;

let asr = null;
let loading = null;
const post = (msg) => self.postMessage(msg);

async function hasWebGPU() {
  try {
    return !!(navigator.gpu && (await navigator.gpu.requestAdapter()));
  } catch {
    return false;
  }
}

async function create(model, device, dtype) {
  const files = {};
  return pipeline('automatic-speech-recognition', model, {
    device,
    dtype,
    progress_callback: (p) => {
      if (p.status === 'progress' && p.total) {
        files[p.file] = { loaded: p.loaded, total: p.total };
        const all = Object.values(files);
        post({
          type: 'progress',
          loaded: all.reduce((a, f) => a + f.loaded, 0),
          total: all.reduce((a, f) => a + f.total, 0),
        });
      }
    },
  });
}

function run(audio) {
  return asr(audio, {
    language: 'portuguese', // forçado: sem detecção de idioma
    task: 'transcribe',
    return_timestamps: false,
    max_new_tokens: 64, // comandos curtos; limita "alucinações" em loop
  });
}

async function load({ model, webgpu, wasm }) {
  const t0 = performance.now();
  let device = 'wasm';
  let dtype = wasm.dtype;
  if (webgpu && (await hasWebGPU())) {
    try {
      asr = await create(model, 'webgpu', webgpu.dtype);
      device = 'webgpu';
      dtype = webgpu.dtype;
    } catch (err) {
      console.warn('[voice] WebGPU falhou, usando WASM', err);
      asr = null;
    }
  }
  if (!asr) asr = await create(model, 'wasm', wasm.dtype);
  const loadMs = performance.now() - t0;
  // Aquecimento: a 1ª inferência compila kernels / aloca memória.
  const w0 = performance.now();
  await run(new Float32Array(16000));
  post({ type: 'ready', device, dtype, loadMs, warmupMs: performance.now() - w0, threads: env.backends.onnx.wasm.numThreads });
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      if (asr) return post({ type: 'ready', cached: true });
      loading ??= load(data).finally(() => (loading = null));
      await loading;
    } else if (data.type === 'transcribe') {
      if (!asr) throw new Error('Modelo não carregado');
      const t0 = performance.now();
      const out = await run(data.audio);
      post({ type: 'result', id: data.id, text: String(out?.text ?? '').trim(), ms: performance.now() - t0 });
    }
  } catch (err) {
    post({ type: 'error', id: data.id, message: String(err?.message ?? err) });
  }
};
