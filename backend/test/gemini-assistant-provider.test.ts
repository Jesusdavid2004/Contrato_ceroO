import { describe, it, expect, vi } from 'vitest';
import { GeminiAssistantProvider } from '../src/infrastructure/ai/GeminiAssistantProvider';
import { AIProviderUnavailableError, AIResponseInvalidError } from '../src/domain/exceptions/index';

function sseResponse(events: unknown[], status = 200): Response {
  const body = events.map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join('');
  const encoder = new TextEncoder();
  // Split into odd-sized chunks to exercise buffering across reads.
  const bytes = encoder.encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 17) {
        controller.enqueue(bytes.slice(offset, offset + 17));
      }
      controller.close();
    },
  });
  return new Response(stream, { status });
}

const request = {
  locale: 'es', contractType: 'LEASE', jurisdiction: 'CO', question: 'Que debo hacer?',
  history: [], sources: [{ id: 'S1', kind: 'clause' as const, label: 'c', text: 'texto' }],
};

function provider(fetchImpl: typeof fetch) {
  return new GeminiAssistantProvider({ apiKey: 'k', model: 'm', maxTokens: 256, timeoutMs: 1000, fetchImpl });
}

function chunk(text: string, usage?: { p: number; c: number }) {
  return {
    candidates: [{ content: { parts: [{ text }] } }],
    ...(usage ? { usageMetadata: { promptTokenCount: usage.p, candidatesTokenCount: usage.c } } : {}),
  };
}

describe('GeminiAssistantProvider', () => {
  it('streams tokens to the listener and returns the joined text with usage', async () => {
    const fetchImpl = vi.fn(async () => sseResponse([chunk('Hola '), chunk('mundo [S1]', { p: 10, c: 4 })]));
    const tokens: string[] = [];
    const result = await provider(fetchImpl as unknown as typeof fetch).reply(request, (piece) => tokens.push(piece));
    expect(tokens).toEqual(['Hola ', 'mundo [S1]']);
    expect(result.text).toBe('Hola mundo [S1]');
    expect(result.usage).toEqual({ model: 'm', inputTokens: 10, outputTokens: 4 });
  });

  it('sends the api key in a header and never in the url', async () => {
    const fetchImpl = vi.fn(async () => sseResponse([chunk('ok')]));
    await provider(fetchImpl as unknown as typeof fetch).reply(request);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('key=');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
  });

  it('maps an HTTP failure to AIProviderUnavailableError without leaking the status body', async () => {
    const fetchImpl = vi.fn(async () => new Response('secret provider error', { status: 500 }));
    await expect(provider(fetchImpl as unknown as typeof fetch).reply(request)).rejects.toBeInstanceOf(AIProviderUnavailableError);
  });

  it('maps a network failure to AIProviderUnavailableError', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('network down'); });
    await expect(provider(fetchImpl as unknown as typeof fetch).reply(request)).rejects.toBeInstanceOf(AIProviderUnavailableError);
  });

  it('throws AIResponseInvalidError when the stream has no text', async () => {
    const fetchImpl = vi.fn(async () => sseResponse([{ candidates: [] }]));
    await expect(provider(fetchImpl as unknown as typeof fetch).reply(request)).rejects.toBeInstanceOf(AIResponseInvalidError);
  });

  it('throws AIResponseInvalidError on a malformed chunk', async () => {
    const fetchImpl = vi.fn(async () => sseResponse(['not-json']));
    await expect(provider(fetchImpl as unknown as typeof fetch).reply(request)).rejects.toBeInstanceOf(AIResponseInvalidError);
  });
});
