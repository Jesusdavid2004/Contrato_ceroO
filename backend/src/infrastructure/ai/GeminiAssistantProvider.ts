import { z } from 'zod';
import {
  AIProviderUnavailableError,
  AIResponseInvalidError,
} from '../../domain/exceptions/index';
import type {
  AssistantProvider,
  AssistantReply,
  AssistantRequest,
  AssistantTokenListener,
} from '../../domain/services/AssistantProvider';
import { logger } from '../../shared/logger';
import {
  ASSISTANT_REPLY_PROMPT_VERSION,
  buildAssistantSystemPrompt,
  buildAssistantUserPrompt,
} from './prompts/assistantReplyV1';

const GEMINI_STREAM_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const RETRY_STATUSES = new Set([429, 503]);
const RETRY_DELAY_MS = 2500;
const SSE_DATA_PREFIX = 'data:';
const MAX_TOKENS_FINISH_REASON = 'MAX_TOKENS';
const ANSWER_TEMPERATURE = 0.2;

export interface GeminiAssistantOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

const streamChunkSchema = z.object({
  candidates: z.array(z.object({
    finishReason: z.string().optional(),
    content: z.object({ parts: z.array(z.object({ text: z.string().optional() })).optional() }).optional(),
  })).optional(),
  usageMetadata: z.object({
    promptTokenCount: z.number().optional(),
    candidatesTokenCount: z.number().optional(),
  }).optional(),
});

function localeName(locale: string): string {
  return locale.toLowerCase().startsWith('es') ? 'Spanish' : 'English';
}

export class GeminiAssistantProvider implements AssistantProvider {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: GeminiAssistantOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async reply(
    request: AssistantRequest,
    onToken?: AssistantTokenListener,
  ): Promise<AssistantReply> {
    const response = await this.openStream(request, false);
    const startedAt = Date.now();
    let text = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let truncated = false;

    for await (const data of readSseData(response)) {
      const chunk = parseChunk(data);
      const piece = (chunk.candidates ?? [])
        .flatMap((candidate) => candidate.content?.parts ?? [])
        .map((part) => part.text ?? '')
        .join('');
      if (piece) {
        text += piece;
        onToken?.(piece);
      }
      truncated = truncated || (chunk.candidates ?? []).some((candidate) => candidate.finishReason === MAX_TOKENS_FINISH_REASON);
      inputTokens = chunk.usageMetadata?.promptTokenCount ?? inputTokens;
      outputTokens = chunk.usageMetadata?.candidatesTokenCount ?? outputTokens;
    }

    if (!text.trim()) throw new AIResponseInvalidError({ reason: 'The assistant response was empty.' });
    if (truncated) logger.warn('Assistant reply hit the token limit', { model: this.options.model, maxTokens: this.options.maxTokens });
    logger.info('Assistant reply generated', {
      promptVersion: ASSISTANT_REPLY_PROMPT_VERSION,
      model: this.options.model,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startedAt,
    });
    return { text: text.trim(), usage: { model: this.options.model, inputTokens, outputTokens } };
  }

  private async openStream(request: AssistantRequest, retried: boolean): Promise<Response> {
    const body = {
      system_instruction: { parts: [{ text: buildAssistantSystemPrompt(localeName(request.locale)) }] },
      contents: [{ role: 'user', parts: [{ text: buildAssistantUserPrompt(request) }] }],
      generationConfig: {
        maxOutputTokens: this.options.maxTokens,
        temperature: ANSWER_TEMPERATURE,
        // Reasoning tokens count against maxOutputTokens and silently truncate the visible answer.
        thinkingConfig: { thinkingBudget: 0 },
      },
    };
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${GEMINI_STREAM_URL}/${this.options.model}:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.options.apiKey },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.options.timeoutMs),
        },
      );
    } catch (error) {
      logger.error('Assistant request failed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
      throw new AIProviderUnavailableError();
    }
    if (RETRY_STATUSES.has(response.status) && !retried) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return this.openStream(request, true);
    }
    if (!response.ok || !response.body) {
      logger.error('Assistant request rejected', { status: response.status });
      throw new AIProviderUnavailableError();
    }
    return response;
  }
}

function parseChunk(data: string): z.infer<typeof streamChunkSchema> {
  try {
    const parsed = streamChunkSchema.safeParse(JSON.parse(data));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through to the typed error below
  }
  throw new AIResponseInvalidError({ reason: 'The assistant stream contained an invalid chunk.' });
}

/** Yields the payload of every `data:` line of a server-sent-events body. */
async function* readSseData(response: Response): AsyncGenerator<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.startsWith(SSE_DATA_PREFIX)) {
        const payload = line.slice(SSE_DATA_PREFIX.length).trim();
        if (payload) yield payload;
      }
      newline = buffer.indexOf('\n');
    }
  }
  const tail = buffer.trim();
  if (tail.startsWith(SSE_DATA_PREFIX)) {
    const payload = tail.slice(SSE_DATA_PREFIX.length).trim();
    if (payload) yield payload;
  }
}
