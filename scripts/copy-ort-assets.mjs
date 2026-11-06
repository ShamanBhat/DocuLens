/**
 * Copies the ONNX Runtime WebAssembly binaries that ship with @huggingface/transformers
 * into `public/ort` so the on-device engine loads them same-origin instead of from a CDN.
 * Together with the Hugging Face model download, this is the only network traffic the
 * local engine ever produces. Runs automatically on `npm install` (postinstall).
 *
 * Set NEXT_PUBLIC_ORT_WASM_PATH=cdn to skip self-hosting and use the library default.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'public', 'ort');
const ORT_FILE = /^ort-.*\.(wasm|mjs)$/;

function findDist() {
  const candidates = [
    path.join(root, 'node_modules', 'onnxruntime-web', 'dist'),
    path.join(root, 'node_modules', '@huggingface', 'transformers', 'dist'),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    return realpathSync(candidate);
  }

  return null;
}

const dist = findDist();
if (!dist) {
  console.warn('[doculens] ONNX Runtime assets not found — skipping ORT asset copy.');
  process.exit(0);
}

const files = readdirSync(dist).filter((name) => ORT_FILE.test(name));
if (files.length === 0) {
  console.warn('[doculens] No ort-*.wasm/mjs files in the installed ORT bundles — set NEXT_PUBLIC_ORT_WASM_PATH=cdn.');
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const name of files) cpSync(path.join(dist, name), path.join(target, name));

console.log(`[doculens] ONNX Runtime assets copied (${files.length} files) -> public/ort`);
