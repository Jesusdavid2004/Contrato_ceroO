import { Suspense } from 'react';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Diagnóstico Contractual — Streaming SSR | ContratoClaro Lab',
  description:
    'Diagnóstico contractual público con carga progresiva mediante Suspense y React Server Components. Los bloques se transmiten en paralelo desde el servidor.',
};

// ─── Async Server Components (stream in parallel) ─────────────────────────────

async function HeaderSection() {
  await new Promise((r) => setTimeout(r, 50));
  return (
    <div className="glass rounded-2xl p-6 border border-cyan-500/20 bg-cyan-500/5">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">📊</span>
        <div>
          <h2 className="font-bold text-white">Diagnóstico General</h2>
          <p className="text-xs text-slate-400">Evaluación rápida del contrato de demostración</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Cláusulas totales', value: '12', color: 'text-white' },
          { label: 'Riesgo alto', value: '3', color: 'text-red-400' },
          { label: 'Puntuación global', value: '4.2/10', color: 'text-yellow-400' },
        ].map((m) => (
          <div key={m.label} className="bg-black/20 rounded-xl p-3 text-center">
            <div className={`text-2xl font-bold ${m.color}`}>{m.value}</div>
            <div className="text-xs text-slate-500 mt-1">{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function RiskAnalysisSection() {
  // Simulates a slower async operation (e.g. AI clause analysis)
  await new Promise((r) => setTimeout(r, 300));
  const clauses = [
    { title: 'Terminación Unilateral sin Aviso', risk: 'HIGH', score: 9 },
    { title: 'Depósito 3 Meses (excede límite)', risk: 'MEDIUM', score: 6 },
    { title: 'Prohibición Subarriendo', risk: 'LOW', score: 2 },
  ];
  return (
    <div className="glass rounded-2xl p-6 border border-red-500/20">
      <h2 className="font-bold text-white mb-4">Análisis de Riesgo por Cláusula</h2>
      <div className="space-y-3">
        {clauses.map((c) => (
          <div key={c.title} className="bg-black/20 rounded-xl p-3 flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{
                background: c.risk === 'HIGH' ? 'rgba(239,68,68,0.2)' : c.risk === 'MEDIUM' ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)',
                color: c.risk === 'HIGH' ? '#f87171' : c.risk === 'MEDIUM' ? '#fbbf24' : '#34d399',
              }}
            >
              {c.score}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-white">{c.title}</div>
              <div className="w-full bg-white/5 rounded-full h-1.5 mt-2">
                <div
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${c.score * 10}%`,
                    background: c.risk === 'HIGH' ? '#ef4444' : c.risk === 'MEDIUM' ? '#f59e0b' : '#10b981',
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function RecommendationsSection() {
  // Simulates the slowest operation (e.g. LLM recommendation generation)
  await new Promise((r) => setTimeout(r, 600));
  const recs = [
    { icon: '⚖️', title: 'Negociar cláusula de terminación', body: 'Exigir preaviso mínimo de 3 meses según art. 518 C.Co.' },
    { icon: '💰', title: 'Reducir depósito de garantía', body: 'Solicitar reducción a máximo 2 meses según Ley 820/2003, art. 29.' },
    { icon: '📄', title: 'Solicitar adéndum de mantenimiento', body: 'Aclarar por escrito que daños estructurales son responsabilidad del arrendador.' },
  ];
  return (
    <div className="glass rounded-2xl p-6 border border-emerald-500/20">
      <h2 className="font-bold text-white mb-4">Recomendaciones Legales</h2>
      <div className="space-y-3">
        {recs.map((r) => (
          <div key={r.title} className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span>{r.icon}</span>
              <span className="text-sm font-semibold text-emerald-300">{r.title}</span>
            </div>
            <p className="text-xs text-slate-400 ml-6">{r.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Skeleton Loaders ──────────────────────────────────────────────────────────

function SkeletonCard({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <div className="glass rounded-2xl p-6 border border-white/5 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-white/5 rounded-full" />
        <div className="h-4 bg-white/5 rounded w-40" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-3 bg-white/5 rounded mb-2" style={{ width: `${70 + i * 10}%` }} />
      ))}
      <p className="text-xs text-slate-600 mt-3">Cargando {label}…</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StreamingPage() {
  return (
    <div className="slide-up">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span className="badge badge-stream">Streaming</span>
          <span className="text-slate-500 text-sm">Streaming SSR · Suspense · React Server Components</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Diagnóstico Contractual Progresivo</h1>
        <p className="text-slate-400">
          Cada sección es un <strong className="text-white">React Server Component</strong> independiente envuelto en{' '}
          <code className="text-cyan-300">&lt;Suspense&gt;</code>. El servidor transmite los bloques a medida que se resuelven en paralelo.
          Nota: la sección de Recomendaciones demora más (~600ms) — observa cómo llega después que las demás.
        </p>
      </div>

      {/* Streaming sections with Suspense boundaries */}
      <div className="space-y-6">
        <Suspense fallback={<SkeletonCard rows={2} label="diagnóstico general" />}>
          <HeaderSection />
        </Suspense>

        <Suspense fallback={<SkeletonCard rows={3} label="análisis de riesgo" />}>
          <RiskAnalysisSection />
        </Suspense>

        <Suspense fallback={<SkeletonCard rows={3} label="recomendaciones" />}>
          <RecommendationsSection />
        </Suspense>
      </div>

      {/* Streaming Technical Note */}
      <div className="mt-8 glass rounded-xl p-4 border border-cyan-500/20 bg-cyan-500/5">
        <h3 className="text-sm font-bold text-cyan-300 mb-1">¿Cómo funciona el Streaming SSR aquí?</h3>
        <p className="text-xs text-slate-400">
          Next.js 15 transmite el HTML inicial de la página inmediatamente (TTFB bajo). Cada{' '}
          <code className="text-cyan-300">&lt;Suspense&gt;</code> con un fallback de skeleton muestra contenido instantáneo mientras
          los RSC asíncronos se ejecutan en paralelo en el servidor. Cuando una sección termina, Next.js inserta el HTML
          resuelto en el stream HTTP/1.1 (chunked transfer encoding). El navegador pinta progresivamente sin bloquear el hilo
          principal. No se requiere JavaScript del cliente para el contenido inicial.
        </p>
      </div>
    </div>
  );
}
