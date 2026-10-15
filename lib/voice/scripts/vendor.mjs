// Copia o runtime do Whisper (transformers.js + binários WASM do onnxruntime-web) para public/voice/vendor,
// para o worker não depender de CDN. Roda no postinstall (`pnpm voice:vendor` para rodar à mão).
import { copyFileSync, mkdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const out = join(web, 'public', 'voice', 'vendor');
mkdirSync(out, { recursive: true });

const require = createRequire(join(web, 'package.json'));
const tfDist = dirname(require.resolve('@huggingface/transformers'));
// onnxruntime-web é dependência do transformers.js; resolve a partir do pacote dele (pnpm isola).
const ortDist = dirname(createRequire(join(realpathSync(tfDist), 'x.js')).resolve('onnxruntime-web'));

for (const [src, name] of [
  [join(tfDist, 'transformers.min.js'), 'transformers.min.js'],
  [join(ortDist, 'ort-wasm-simd-threaded.asyncify.mjs'), 'ort-wasm-simd-threaded.asyncify.mjs'],
  [join(ortDist, 'ort-wasm-simd-threaded.asyncify.wasm'), 'ort-wasm-simd-threaded.asyncify.wasm'],
]) {
  copyFileSync(src, join(out, name));
  console.log('voice vendor:', name);
}
