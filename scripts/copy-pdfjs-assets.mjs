/**
 * Copies PDF.js runtime assets (worker, cMaps, standard fonts, wasm decoders) into
 * `public/pdfjs` so they are served same-origin on any host, independent of the
 * bundler (Turbopack or webpack). Runs automatically on `npm install` (postinstall).
 *
 * The pdfjs-dist copy is resolved relative to react-pdf so the worker version always
 * matches the API version react-pdf was built against.
 */
import { cpSync, existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'public', 'pdfjs');

function findPdfjsDist() {
  const candidates = [];
  const reactPdf = path.join(root, 'node_modules', 'react-pdf');
  if (existsSync(reactPdf)) {
    const real = realpathSync(reactPdf);
    candidates.push(path.join(real, 'node_modules', 'pdfjs-dist')); // nested (npm / yarn)
    candidates.push(path.join(path.dirname(real), 'pdfjs-dist')); // sibling (pnpm store)
  }
  candidates.push(path.join(root, 'node_modules', 'pdfjs-dist')); // hoisted
  return candidates.find((dir) => existsSync(path.join(dir, 'build', 'pdf.worker.min.mjs')));
}

const pdfjsDist = findPdfjsDist();

if (!pdfjsDist) {
  console.warn('[doculens] pdfjs-dist not found — skipping PDF.js asset copy.');
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

cpSync(path.join(pdfjsDist, 'build', 'pdf.worker.min.mjs'), path.join(target, 'pdf.worker.min.mjs'));

for (const dir of ['cmaps', 'standard_fonts', 'wasm']) {
  const source = path.join(pdfjsDist, dir);
  if (existsSync(source)) cpSync(source, path.join(target, dir), { recursive: true });
}

console.log(`[doculens] PDF.js assets copied from ${path.relative(root, pdfjsDist)} -> public/pdfjs`);
