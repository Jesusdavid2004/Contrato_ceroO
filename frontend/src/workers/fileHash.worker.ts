// Web Worker: file pre-hash off the main thread (class topic: Web Workers + postMessage).
// Receives an ArrayBuffer via postMessage, returns SHA-256 hex (or fallback hash).
self.onmessage = async (event: MessageEvent) => {
  const { id, buffer } = event.data as { id: number; buffer: ArrayBuffer };
  try {
    let digest: string;
    const subtle = (globalThis.crypto as Crypto | undefined)?.subtle;
    if (subtle) {
      const hash = await subtle.digest('SHA-256', buffer);
      digest = Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } else {
      let h = 0;
      const view = new Uint8Array(buffer);
      for (let i = 0; i < view.length; i += 1) h = (h * 31 + view[i]) >>> 0;
      digest = h.toString(16);
    }
    (self as unknown as { postMessage: (m: unknown) => void }).postMessage({ id, ok: true, digest });
  } catch (error) {
    (self as unknown as { postMessage: (m: unknown) => void }).postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'hash_failed',
    });
  }
};
