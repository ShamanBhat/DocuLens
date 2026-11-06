# DocuLens — Project Guidelines

**DocuLens** (AI-Powered Long-Context Document & Contract Auditor). Tagline: *Enterprise long-context document analysis, cross-clause risk auditing, and grounded Q&A powered by your choice of AI model.* User-facing docs, API reference and the architecture diagram live in [README.md](../README.md). Link to the README instead of duplicating it.

## Stack (versions are pinned on purpose)

- Next.js 16 App Router, React 19.2, TypeScript strict, Tailwind CSS v4 (CSS-first config in [app/globals.css](../app/globals.css), no `tailwind.config`), Framer Motion 12, lucide-react 1.x.
- **Vercel AI SDK v5**: `ai@^5`, `@ai-sdk/react@^2`, `@ai-sdk/{anthropic,openai,google}@^2`. Don't upgrade to v6/v7 APIs without migrating every call site. Use v5 names: `maxOutputTokens`, `ModelMessage`, `UIMessage` with `parts`, `DefaultChatTransport`, `sendMessage`, `toUIMessageStreamResponse`, `toTextStreamResponse`.
- zod v4 (`z.looseObject`, etc.), react-pdf v10 (PDF.js), react-markdown 10 + remark-gfm.

## Architecture

- **Model-agnostic routing**: every request carries a runtime key `provider:model-id`. [lib/ai/registry.ts](../lib/ai/registry.ts) (`server-only`) resolves it with `createProviderRegistry` in this order: user selection → `DOCULENS_DEFAULT_MODEL` → first provider with a key. Only catalogued models are routable (allow-list).
  - Client-safe catalog and `PROVIDERS` live in [lib/ai/models.ts](../lib/ai/models.ts).
  - To add a provider, install `@ai-sdk/<name>`, register it in the registry, and add it to `PROVIDERS`. Also add an accent color in [components/model-switcher.tsx](../components/model-switcher.tsx).
- **API routes** (Node runtime):
  - [analyze](../app/api/analyze/route.ts): `streamObject` + `analysisSchema`, consumed by `useObject`.
  - [chat](../app/api/chat/route.ts): `streamText`, consumed by `useChat`.
  - [models](../app/api/models/route.ts): catalog + availability; never returns keys.
  - Shared validation, token budgeting and safe error mapping live in [lib/server/api-utils.ts](../lib/server/api-utils.ts). Reuse `parseJsonRequest`, `resolveModelForRequest`, `planOutputBudget` and `toPublicErrorMessage`.
- **Long-context, not RAG**: the whole bundle goes into one prompt. Don't add chunking or vector retrieval.
- **Documents**: PDFs are parsed **in the browser** ([lib/documents/extract.ts](../lib/documents/extract.ts)). The server only receives `DocumentPayload` (`{ id: "D1", name, pages: [{ page, text }] }`), never binaries. [lib/documents/context.ts](../lib/documents/context.ts) serializes it into the page-anchored envelope `<document id="D1"><page number="N">…</page></document>`.
- **UI**: [app/page.tsx](../app/page.tsx) orchestrates the header, PDF viewer, audit dashboard and chat sidebar. Citations navigate the viewer through `CitationProvider` ([components/citation-context.tsx](../components/citation-context.tsx)). Dashboard and chat are keyed by the bundle `version`, so they reset whenever documents change.

## Conventions

- **Structured output must work on Anthropic, OpenAI and Gemini**: every schema field is required, and absent values use `.nullable()` instead of `.optional()`. Don't use unions, `z.record`, `.int()` or numeric bounds. Put guidance in `.describe()`.
- **Citations**: the chat format is `[D1 p.12]` / `[D1 p.12 §4.2]`. Prompts in [lib/ai/prompts.ts](../lib/ai/prompts.ts) and the parser in [lib/documents/citations.ts](../lib/documents/citations.ts) must stay in sync. Page numbers always come from `<page number>` tags.
- **Prompt changes**: keep the shared `GROUNDING_RULES` (untrusted document text, no outside knowledge). In chat, put the documents first so the cacheable prefix stays stable; the Anthropic `cacheControl` is set on the system message.
- **PDF.js**:
  - Import it only on the client: use `next/dynamic` with `ssr: false` for the viewer, and `await import()` for extraction.
  - Set `pdfjs.GlobalWorkerOptions.workerSrc` in the same module that renders `<Document>`.
  - Assets come from `/pdfjs/*`, which `scripts/copy-pdfjs-assets.mjs` copies on postinstall (gitignored).
  - Keep `PDF_DOCUMENT_OPTIONS` a module constant.
- **Streaming partials**: data from `useObject` is a `PartialAnalysis` (`DeepPartial`). Guard every field, and use `compact()` from [lib/utils.ts](../lib/utils.ts) on arrays.
- **Tailwind**: use complete static class strings (e.g. the `SEVERITY_STYLES` lookups in [components/ui/primitives.tsx](../components/ui/primitives.tsx)), the v4 syntax (`bg-linear-to-r`, `size-*`), and `cn()` for merging.
- **Icons**: use canonical lucide 1.x names (`TriangleAlert`, `LoaderCircle`, `CircleAlert`). Brand icons are not available.
- **JSX text**: use `’` or `&apos;`, not a raw `'` (enforced by `react/no-unescaped-entities`). Avoid `Date.now()` or other impure calls during render; use them only in handlers or effects.

## Security (keep these guarantees)

- API keys are only read in `server-only` modules, and they must never reach the client.
- Validate every request body with Zod and enforce size limits. Chat accepts only `user`/`assistant` roles, rebuilt from text parts only.
- Neutralize envelope tags inside document text, render Markdown without raw HTML, and HTML-escape text in `customTextRenderer`. Keep `isEvalSupported: false`.
- Return provider failures through `toPublicErrorMessage`. Never forward raw provider errors.

## Build and Test

```bash
npm install          # also runs scripts/copy-pdfjs-assets.mjs
npm run dev
npm run lint         # ESLint flat config (eslint-config-next 16)
npm run typecheck
npm run build
```

Node ≥ 20.9 is required. Copy `.env.example` to `.env.local` and set at least one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`. CI ([.github/workflows/ci.yml](workflows/ci.yml)) runs lint, typecheck and build.
