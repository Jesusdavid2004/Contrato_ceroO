import { describe, expect, it, vi, afterEach } from 'vitest';
import { GeminiDocumentProcessor } from '../src/infrastructure/ai/GeminiDocumentProcessor';

function geminiTextResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    }),
  };
}

describe('GeminiDocumentProcessor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('transcribes an image and sends it as inline base64 data', async () => {
    const fetchMock = vi.fn(async () => geminiTextResponse('Transcribed contract text.'));
    vi.stubGlobal('fetch', fetchMock);
    const processor = new GeminiDocumentProcessor('test-key', 'test-model');

    const text = await processor.transcribeImage(Buffer.from('%PDF-fake-bytes'), 'image/png');

    expect(text).toBe('Transcribed contract text.');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('test-model');
    const body = JSON.parse(init.body as string) as {
      contents: Array<{ parts: Array<{ inline_data?: { mime_type: string } }> }>;
    };
    expect(body.contents[0].parts[0]).toHaveProperty('inline_data');
    expect(body.contents[0].parts[0].inline_data?.mime_type).toBe('image/png');
  });

  it('segments text through the JSON contract', async () => {
    const fetchMock = vi.fn(async () => geminiTextResponse(JSON.stringify({
      clauses: [{ text: 'Clause one.' }, { text: 'Clause two.' }, { text: 'Clause three.' }],
    })));
    vi.stubGlobal('fetch', fetchMock);
    const processor = new GeminiDocumentProcessor('test-key', 'test-model');

    const clauses = await processor.segment('Clause one. Clause two. Clause three.');

    expect(clauses).toHaveLength(3);
    expect(clauses[0]).toEqual({ orderIndex: 0, text: 'Clause one.' });
  });
});
