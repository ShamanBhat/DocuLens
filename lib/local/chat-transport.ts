import { DefaultChatTransport, type ChatTransport, type UIMessageChunk } from 'ai';
import type { ChatMetadata, DocuLensUIMessage, DocumentPayload } from '@/lib/types';
import { getLocalEngine } from './engine';
import { findLocalModel, isLocalKey } from './models';
import { buildLocalChatSystemPrompt } from './prompts';
import type { ChatMessage } from './protocol';
import { selectRelevantPages } from './retrieval';

/**
 * Plugs the on-device model into `useChat` by implementing the AI SDK's ChatTransport interface:
 * instead of POSTing to /api/chat, the stream is produced by the in-browser worker. Cloud model
 * keys are delegated to the stock HTTP transport, so one chat UI serves both backends.
 */

type SendOptions = Parameters<ChatTransport<DocuLensUIMessage>['sendMessages']>[0];

interface ChatBody {
  modelKey?: string | null;
  documents?: DocumentPayload[];
}

const MAX_HISTORY_TURNS = 4;
const MAX_TURN_CHARS = 1_200;
const CHAT_OUTPUT_TOKENS = 512;
/** Chat prompt budget leaves room for the conversation history. */
const HISTORY_RESERVE_CHARS = 3_000;

function messageText(message: DocuLensUIMessage): string {
  return message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('').trim();
}

function readBody(body: SendOptions['body']): ChatBody {
  return body && typeof body === 'object' ? (body as ChatBody) : {};
}

export class LocalChatTransport implements ChatTransport<DocuLensUIMessage> {
  async sendMessages({ messages, abortSignal, body }: SendOptions): Promise<ReadableStream<UIMessageChunk>> {
    const { modelKey, documents = [] } = readBody(body);
    const model = findLocalModel(modelKey);
    if (!model) throw new Error('Select an on-device model to ask questions locally.');

    const last = messages.at(-1);
    const question = last ? messageText(last) : '';
    if (!question) throw new Error('Ask a question first.');

    // Wait for the weights here (not inside the stream) so the UI keeps showing its "thinking" state
    // and the download overlay stays the single source of truth while a first-run download finishes.
    const engine = getLocalEngine();
    await engine.load(model);

    const previousQuestion = [...messages.slice(0, -1)].reverse().find((message) => message.role === 'user');
    const query = [previousQuestion ? messageText(previousQuestion) : '', question].join(' ');
    const budgetChars = Math.max(2_000, model.promptBudget * 4 - HISTORY_RESERVE_CHARS);
    const retrieval = selectRelevantPages(documents, query, budgetChars);

    const history: ChatMessage[] = messages
      .slice(0, -1)
      .slice(-MAX_HISTORY_TURNS * 2)
      .flatMap((message) => {
        const content = messageText(message).slice(0, MAX_TURN_CHARS);
        return content && (message.role === 'user' || message.role === 'assistant') ? [{ role: message.role, content }] : [];
      });

    const chat: ChatMessage[] = [
      { role: 'system', content: buildLocalChatSystemPrompt(retrieval.documents, retrieval) },
      ...history,
      { role: 'user', content: question },
    ];

    const metadata: ChatMetadata = { model: `${model.label} · on-device`, modelKey: model.key };
    const textId = 'local-text';
    let closed = false;

    return new ReadableStream<UIMessageChunk>({
      async start(controller) {
        // After the consumer cancels, enqueue/close throw — swallow that instead of crashing the worker callback.
        const enqueue = (chunk: UIMessageChunk) => {
          if (closed) return;
          try {
            controller.enqueue(chunk);
          } catch {
            closed = true;
          }
        };

        enqueue({ type: 'start', messageMetadata: metadata });
        enqueue({ type: 'text-start', id: textId });

        try {
          const result = await engine.generate({
            messages: chat,
            maxNewTokens: Math.min(model.maxOutputTokens, CHAT_OUTPUT_TOKENS),
            temperature: 0.3,
            repetitionPenalty: 1.1,
            signal: abortSignal,
            onToken: (delta) => enqueue({ type: 'text-delta', id: textId, delta }),
          });

          enqueue({ type: 'text-end', id: textId });
          enqueue({ type: 'finish', messageMetadata: { ...metadata, totalTokens: result.tokens } });
        } catch (error) {
          enqueue({
            type: 'error',
            errorText: error instanceof Error ? error.message : 'The on-device model failed to answer.',
          });
        } finally {
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      },
      cancel() {
        closed = true;
        engine.interrupt();
      },
    });
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null; // Local generations cannot be resumed.
  }
}

/** Routes each request by model key: `local:*` runs in the browser, everything else hits /api/chat. */
export class RoutingChatTransport implements ChatTransport<DocuLensUIMessage> {
  private readonly remote = new DefaultChatTransport<DocuLensUIMessage>({ api: '/api/chat' });
  private readonly local = new LocalChatTransport();

  sendMessages(options: SendOptions): Promise<ReadableStream<UIMessageChunk>> {
    return isLocalKey(readBody(options.body).modelKey) ? this.local.sendMessages(options) : this.remote.sendMessages(options);
  }

  reconnectToStream(options: Parameters<ChatTransport<DocuLensUIMessage>['reconnectToStream']>[0]) {
    return this.remote.reconnectToStream(options);
  }
}
