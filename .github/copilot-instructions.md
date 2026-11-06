# DocuLens — Project Guidelines

**DocuLens** (In-Browser AI Document & Contract Auditor). Tagline: *Enterprise long-context document analysis and risk auditing running 100% locally in your browser using WebGPU & Hugging Face.* User-facing docs, the architecture diagrams and the privacy explanation live in [README.md](../README.md). Link to the README instead of duplicating it.

## Product principle

**Local-first, cloud optional.** The default path runs a Hugging Face ONNX model on the user's GPU (WebGPU) inside a Web Worker; documents never reach a server. Cloud models (Anthropic/OpenAI/Gemini) are an opt-in fallback and must always be clearly labelled as "text leaves the device" (`EngineBadge`, launcher notice). Never route a request to the cloud implicitly.

## Stack (versions are pinned on purpose)

- Next.js 16 App Router, React 19.2, TypeScript strict, Tailwind CSS v4 (CSS-first config in [app/globals.css](../app/globals.css), no `tailwind.config`), Framer Motion 12, lucide-react 1.x.
- **`@huggingface/transformers` v4** (ONNX Runtime Web; `pipeline('text-generation')`, `TextStreamer`, `InterruptableStoppingCriteria`, `env`). Only [app/workers/ai.worker.ts](../app/workers/ai.worker.ts) may import it — never the main thread.
- **Vercel AI SDK v5** for the cloud path and for `useChat`/`useObject`: `ai@^5`, `@ai-sdk/react@^2`, `@ai-sdk/{anthropic,openai,google}@^2`. Don't upgrade to v6/v7 APIs without migrating every call site. Use v5 names: `maxOutputTokens`, `ModelMessage`, `UIMessage` with `parts`, `DefaultChatTransport`, `ChatTransport`, `UIMessageChunk`, `sendMessage`, `toUIMessageStreamResponse`, `toTextStreamResponse`.
- zod v4, react-pdf v10 (PDF.js), react-markdown 10 + remark-gfm.

## Architecture

- **On-device engine** ([lib/local/](../lib/local)):
  - [engine.ts](../lib/local/engine.ts): main-thread singleton (`getLocalEngine()`) that owns the worker, aggregates per-file download events into bytes/%/speed/ETA, serialises generations, and exposes an immutable snapshot for `useSyncExternalStore` (`useLocalEngine()`). It must stay free of Transformers.js imports.
  - [protocol.ts](../lib/local/protocol.ts) defines the worker message types. Change both sides together.
  - The worker URL must stay an inline `new Worker(new URL('…ai.worker.ts', import.meta.url), { type: 'module' })` literal so the bundler emits a separate chunk.
  - [models.ts](../lib/local/models.ts): catalog (`HuggingFaceTB/SmolLM2-360M-Instruct`, not an `onnx-community` repo, is the SmolLM2 ONNX source), dtype by device (`q4f16` needs `shader-f16`, else `q4`; WASM fallback `q8`). [webgpu.ts](../lib/local/webgpu.ts) detects support.
  - The model auto-downloads on app open via `useLocalEngineAutoload` (skipped under Data Saver or `NEXT_PUBLIC_AUTO_DOWNLOAD=off`). WebGPU init failure retries once on WASM.
- **On-device audit** ([analysis.ts](../lib/local/analysis.ts)): map → reduce over page-aligned windows ([windows.ts](../lib/local/windows.ts)); lenient JSON ([json.ts](../lib/local/json.ts)); citations are grounded to real pages and unverifiable quotes dropped; deterministic missing-protection scan ([gaps.ts](../lib/local/gaps.ts)). Output is a `PartialAnalysis` identical in shape to the cloud audit so one dashboard renders both. Small models cannot do cross-clause conflicts — leave `conflicts` empty locally.
- **On-device chat**: [chat-transport.ts](../lib/local/chat-transport.ts) implements the AI SDK `ChatTransport` (BM25 page retrieval in [retrieval.ts](../lib/local/retrieval.ts)); `RoutingChatTransport` sends `local:*` keys to the worker and everything else to `/api/chat`.
- **Model keys**: on-device = `local:<hf-repo-id>`; cloud = `provider:model-id`. [lib/engines.ts](../lib/engines.ts) defines `EngineModel` (`LocalModelSpec | CloudEngineModel`, discriminated by `kind`).
- **Cloud path** (Node runtime): [lib/ai/registry.ts](../lib/ai/registry.ts) (`server-only`) resolves keys with `createProviderRegistry` (user selection → `DOCULENS_DEFAULT_MODEL` → first provider with a key; allow-list only). Routes: [analyze](../app/api/analyze/route.ts) (`streamObject` + `analysisSchema`), [chat](../app/api/chat/route.ts) (`streamText`), [models](../app/api/models/route.ts) (never returns keys). Reuse `parseJsonRequest`, `resolveModelForRequest`, `planOutputBudget`, `toPublicErrorMessage` from [lib/server/api-utils.ts](../lib/server/api-utils.ts). Cloud sends the whole bundle in one prompt — no chunking there.
- **Documents**: PDFs are parsed **in the browser** ([lib/documents/extract.ts](../lib/documents/extract.ts)). `DocumentPayload` is `{ id: "D1", name, pages: [{ page, text }] }`; [context.ts](../lib/documents/context.ts) serializes it into `<document id="D1"><page number="N">…</page></document>` (`excerpt: true` for page subsets).
- **UI**: [app/page.tsx](../app/page.tsx) orchestrates header, PDF viewer, audit dashboard, chat and the download overlay ([components/engine/](../components/engine)). Citations navigate the viewer via `CitationProvider`. Dashboard and chat are keyed by the bundle `version`.

## Conventions

- **Structured output must work on every provider and local model**: every schema field is required, absent values use `.nullable()`, no unions / `z.record` / `.int()` / numeric bounds. Put guidance in `.describe()`. Local code builds the same shape manually with lenient readers.
- **Citations**: chat format `[D1 p.12]` / `[D1 p.12 §4.2]`. Cloud prompts ([lib/ai/prompts.ts](../lib/ai/prompts.ts)), local prompts ([lib/local/prompts.ts](../lib/local/prompts.ts)) and the parser ([lib/documents/citations.ts](../lib/documents/citations.ts)) must stay in sync. Page numbers always come from `<page number>` tags.
- **Prompt changes**: keep the shared `GROUNDING_RULES` (untrusted document text, no outside knowledge). Local prompts must stay short, with one JSON template and an explicit "never copy the template" guard. In cloud chat the documents come first (stable cacheable prefix; Anthropic `cacheControl` on the system message).
- **No setState inside effect bodies** (`react-hooks/set-state-in-effect`): derive state, use `useSyncExternalStore` (see `useModelSelection`, `useLocalEngine`), or set state in async callbacks/handlers.
- **PDF.js**: client-only (`next/dynamic` `ssr: false` for the viewer, `await import()` for extraction); set `pdfjs.GlobalWorkerOptions.workerSrc` in the module that renders `<Document>`; assets come from `/pdfjs/*`; keep `PDF_DOCUMENT_OPTIONS` a module constant.
- **Self-hosted runtime assets**: `public/pdfjs` and `public/ort` are generated by `scripts/copy-*-assets.mjs` on postinstall (gitignored). ONNX Runtime wasm is served from `/ort/` so the only external request is the model download.
- **Streaming partials**: `useObject` and the local hook both yield `PartialAnalysis` (`DeepPartial`). Guard every field and use `compact()` from [lib/utils.ts](../lib/utils.ts) on arrays.
- **Tailwind**: complete static class strings (e.g. `SEVERITY_STYLES` in [components/ui/primitives.tsx](../components/ui/primitives.tsx)), v4 syntax (`bg-linear-to-r`, `size-*`), `cn()` for merging.
- **Icons**: canonical lucide 1.x names (`TriangleAlert`, `LoaderCircle`, `CircleAlert`). Brand icons are not available.
- **JSX text**: use `’` or `&apos;`, not a raw `'` (`react/no-unescaped-entities`). No impure calls (`Date.now()`) during render.
- **Public config** is read only via literal `process.env.NEXT_PUBLIC_*` in [lib/config.ts](../lib/config.ts).

## Security & privacy (keep these guarantees)

- On-device path: no request may carry document text; the only external traffic is the model download (and none after caching). Any new network call must be reviewed against this.
- API keys are only read in `server-only` modules and never reach the client.
- Cloud routes: validate every body with Zod, enforce size limits, accept only `user`/`assistant` chat roles rebuilt from text parts.
- Neutralize envelope tags inside document text, render Markdown without raw HTML, HTML-escape text in `customTextRenderer`, keep `isEvalSupported: false`.
- Return provider failures through `toPublicErrorMessage`; never forward raw provider errors.

## Build and Test

```bash
npm install          # also runs scripts/copy-pdfjs-assets.mjs and scripts/copy-ort-assets.mjs
npm run dev
npm run lint         # ESLint flat config (eslint-config-next 16)
npm run typecheck
npm run build
```

Node ≥ 20.9. No API key is required for on-device use; copy `.env.example` to `.env.local` only to customise or enable cloud models. Testing local inference needs a WebGPU-capable browser (Chrome/Edge) — it cannot run in Node. CI ([.github/workflows/ci.yml](workflows/ci.yml)) runs lint, typecheck and build.
