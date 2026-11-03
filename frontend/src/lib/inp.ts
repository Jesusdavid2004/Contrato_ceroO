// Minimal INP (Interaction to Next Paint) observer for class evidence.
// INP = input delay + processing duration + presentation delay.
// Good <= 200ms, needs improvement 200-500ms, poor > 500ms.
export interface InpSample {
  name: string;
  durationMs: number;
  rating: 'good' | 'needs-improvement' | 'poor';
}

const listeners = new Set<(sample: InpSample) => void>();

function rate(durationMs: number): InpSample['rating'] {
  if (durationMs <= 200) return 'good';
  if (durationMs <= 500) return 'needs-improvement';
  return 'poor';
}

export function onInpSample(listener: (sample: InpSample) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function initInpObserver(): void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const e = entry as PerformanceEntry & { interactionId?: number; duration: number; name: string };
        if (!e.interactionId) continue;
        const sample: InpSample = { name: e.name || 'interaction', durationMs: e.duration, rating: rate(e.duration) };
        listeners.forEach((l) => l(sample));
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.debug(`[inp] ${sample.name}: ${sample.durationMs.toFixed(1)}ms (${sample.rating})`);
        }
      }
    });
    observer.observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  } catch {
    // PerformanceObserver event timing is not available in all browsers; ignore.
  }
}

// Class demo helper: Task (macrotask) vs Microtask ordering in the Event Loop.
// Returns the execution order: microtasks always run before the next task.
export async function demoTaskVsMicrotask(): Promise<string[]> {
  const order: string[] = [];
  order.push('sync');
  setTimeout(() => order.push('task:setTimeout'), 0);
  queueMicrotask(() => order.push('microtask:queueMicrotask'));
  await Promise.resolve().then(() => order.push('microtask:promise'));
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  return order;
}
