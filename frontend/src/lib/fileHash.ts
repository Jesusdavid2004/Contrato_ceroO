// Best-effort file pre-hash in a Web Worker so the main thread stays free for INP.
// Falls back to main-thread hashing when Workers are unavailable (tests, SSR).
export async function preHashFile(file: File, timeoutMs = 3000): Promise<string | null> {
  try {
    const buffer = await file.arrayBuffer();
    if (typeof Worker === 'undefined') return null;
    const worker = new Worker(new URL('../workers/fileHash.worker.ts', import.meta.url), { type: 'module' });
    const id = Date.now();
    const digest = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        worker.terminate();
        resolve(null);
      }, timeoutMs);
      worker.onmessage = (event: MessageEvent) => {
        const data = event.data as { id: number; ok: boolean; digest?: string };
        if (data.id !== id) return;
        clearTimeout(timer);
        worker.terminate();
        resolve(data.ok ? (data.digest ?? null) : null);
      };
      worker.onerror = () => {
        clearTimeout(timer);
        worker.terminate();
        resolve(null);
      };
      worker.postMessage({ id, buffer }, [buffer]);
    });
    return digest;
  } catch {
    return null;
  }
}
