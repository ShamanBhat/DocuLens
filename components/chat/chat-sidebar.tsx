'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { motion } from 'framer-motion';
import { Bot, CircleAlert, CornerDownLeft, MessageSquareText, Square, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ModelOption } from '@/lib/ai/models';
import { toDocumentPayload } from '@/lib/documents/context';
import type { DocuLensUIMessage, LoadedDocument } from '@/lib/types';
import { cn, formatTokens, readableError } from '@/lib/utils';
import { MarkdownMessage } from './markdown-message';

// Stateless transport — the model key and documents are attached per request.
const transport = new DefaultChatTransport<DocuLensUIMessage>({ api: '/api/chat' });

const SUGGESTIONS = [
  'Summarise each party’s termination rights and notice periods.',
  'Is liability capped? List every carve-out.',
  'Which clauses conflict with each other across the bundle?',
  'List all payment obligations with amounts and due dates.',
];

interface ChatSidebarProps {
  documents: LoadedDocument[];
  model: ModelOption | null;
}

/** Grounded Q&A over the full bundle. Switch models mid-conversation — each answer shows its model. */
export function ChatSidebar({ documents, model }: ChatSidebarProps) {
  const { messages, sendMessage, status, stop, error, regenerate, setMessages } = useChat<DocuLensUIMessage>({
    transport,
    experimental_throttle: 50,
  });
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const payload = useMemo(() => toDocumentPayload(documents), [documents]);
  const busy = status === 'submitted' || status === 'streaming';
  const requestOptions = { body: { modelKey: model?.key ?? null, documents: payload } };

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight });
  }, [messages, status]);

  const ask = (text: string) => {
    const question = text.trim();
    if (!question || busy || !model) return;
    void sendMessage({ text: question }, requestOptions);
    setInput('');
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    ask(input);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      ask(input);
    }
  };

  const lastMessage = messages.at(-1);
  const awaitingFirstToken = status === 'submitted' && lastMessage?.role === 'user';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <MessageSquareText className="size-4 text-indigo-300" />
            Grounded Q&amp;A
          </h2>
          <p className="truncate text-xs text-slate-500">
            {model ? (
              <>
                Answering with <span className="text-slate-300">{model.label}</span>
              </>
            ) : (
              'Select a model to start'
            )}
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            disabled={busy}
            title="Clear conversation"
            className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-slate-200 disabled:opacity-40"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-center">
            <p className="text-sm font-medium text-slate-200">Ask anything about this bundle</p>
            <p className="mt-1 text-xs text-slate-500">
              Every answer cites document, page and section — click a citation to open the source.
            </p>
            <div className="mt-4 space-y-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => ask(suggestion)}
                  disabled={!model}
                  className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left text-xs text-slate-300 transition hover:border-indigo-400/30 hover:bg-indigo-500/10 hover:text-white disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              streaming={status === 'streaming' && message.id === lastMessage?.id}
            />
          ))
        )}

        {awaitingFirstToken && (
          <div className="flex items-center gap-2.5">
            <AssistantAvatar />
            <div className="flex gap-1" aria-label="Thinking">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="size-1.5 rounded-full bg-indigo-300"
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </div>
          </div>
        )}

        {error && !busy && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            <p className="flex-1">{readableError(error)}</p>
            <button
              type="button"
              onClick={() => void regenerate(requestOptions)}
              disabled={!model}
              className="font-medium underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="border-t border-white/5 p-3">
        <div className="relative rounded-xl border border-white/10 bg-slate-950/60 transition focus-within:border-indigo-400/50">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            maxLength={4000}
            aria-label="Ask a question about the documents"
            placeholder={model ? `Ask ${model.label} about the documents…` : 'Select a model to start'}
            className="block max-h-40 w-full resize-none bg-transparent px-3 py-2.5 pr-12 text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => void stop()}
              aria-label="Stop generating"
              className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-lg bg-white/10 text-slate-200 transition hover:bg-white/20"
            >
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || !model}
              aria-label="Send question"
              className="absolute bottom-2 right-2 grid size-8 place-items-center rounded-lg bg-indigo-500 text-white transition hover:bg-indigo-400 disabled:bg-white/10 disabled:text-slate-500"
            >
              <CornerDownLeft className="size-4" />
            </button>
          )}
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          Grounded in your documents only. AI can make mistakes — verify critical findings against the source.
        </p>
      </form>
    </div>
  );
}

function AssistantAvatar() {
  return (
    <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/5 ring-1 ring-white/10">
      <Bot className="size-3.5 text-indigo-300" />
    </div>
  );
}

function ChatMessage({ message, streaming }: { message: DocuLensUIMessage; streaming: boolean }) {
  const text = message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('');

  if (message.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-indigo-500/90 px-3.5 py-2 text-sm text-white">
          {text}
        </div>
      </motion.div>
    );
  }

  const meta = message.metadata;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2.5">
      <AssistantAvatar />
      <div className="min-w-0 flex-1">
        <MarkdownMessage content={text} />
        {streaming && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-indigo-300 align-middle" />}
        {meta?.model && (
          <p className={cn('mt-2 text-[10px] uppercase tracking-wider text-slate-500', streaming && 'opacity-60')}>
            {meta.model}
            {meta.totalTokens ? ` · ${formatTokens(meta.totalTokens)} tokens` : ''}
          </p>
        )}
      </div>
    </motion.div>
  );
}
