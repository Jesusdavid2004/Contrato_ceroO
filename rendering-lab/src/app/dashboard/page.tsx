import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Performance Dashboard — Rendering Lab | ContratoClaro',
  description: 'Comparativa de métricas de rendimiento entre los 5 patrones de renderizado de Next.js 15.',
};

const PATTERNS = [
  {
    name: 'CSR',
    label: 'Client-Side Rendering',
    badge: 'badge-csr',
    ttfb: 80,
    fcp: 600,
    lcp: 900,
    seoScore: 35,
    cacheHeader: 'no-store (assets)',
    execution: 'Browser',
    hydration: true,
    streaming: false,
    indexable: false,
  },
  {
    name: 'SSR',
    label: 'Server-Side Rendering',
    badge: 'badge-ssr',
    ttfb: 200,
    fcp: 280,
    lcp: 400,
    seoScore: 95,
    cacheHeader: 'no-store',
    execution: 'Node.js Server',
    hydration: true,
    streaming: false,
    indexable: true,
  },
  {
    name: 'SSG',
    label: 'Static Site Generation',
    badge: 'badge-ssg',
    ttfb: 20,
    fcp: 100,
    lcp: 140,
    seoScore: 100,
    cacheHeader: 'public, max-age=31536000, immutable',
    execution: 'CDN Edge',
    hydration: false,
    streaming: false,
    indexable: true,
  },
  {
    name: 'ISR',
    label: 'Incremental Static Regen',
    badge: 'badge-isr',
    ttfb: 25,
    fcp: 110,
    lcp: 160,
    seoScore: 98,
    cacheHeader: 'stale-while-revalidate=60',
    execution: 'CDN Edge + Server',
    hydration: false,
    streaming: false,
    indexable: true,
  },
  {
    name: 'Stream',
    label: 'Streaming SSR',
    badge: 'badge-stream',
    ttfb: 50,
    fcp: 150,
    lcp: 280,
    lcp_note: '(progressive)',
    seoScore: 85,
    cacheHeader: 'no-cache (partial)',
    execution: 'Node.js Server (chunked)',
    hydration: true,
    streaming: true,
    indexable: true,
  },
];

function MetricBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="relative w-full h-2 bg-white/5 rounded-full overflow-hidden">
      <div
        className="absolute left-0 top-0 h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function SeoRing({ score }: { score: number }) {
  const color = score >= 90 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444';
  const r = 18;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  return (
    <svg width="50" height="50" viewBox="0 0 50 50" className="shrink-0">
      <circle cx="25" cy="25" r={r} stroke="rgba(255,255,255,0.05)" strokeWidth="4" fill="none" />
      <circle
        cx="25"
        cy="25"
        r={r}
        stroke={color}
        strokeWidth="4"
        fill="none"
        strokeDasharray={`${circumference}`}
        strokeDashoffset={`${offset}`}
        strokeLinecap="round"
        transform="rotate(-90 25 25)"
      />
      <text x="25" y="30" textAnchor="middle" fontSize="11" fontWeight="bold" fill={color}>
        {score}
      </text>
    </svg>
  );
}

export default async function DashboardPage() {
  const generatedAt = new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    timeStyle: 'medium',
  });

  return (
    <div className="slide-up">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Performance Dashboard</h1>
        <p className="text-slate-400 mb-3">
          Comparativa de métricas Web Vitals estimadas, indexabilidad SEO y características de cada patrón de renderizado.
          Generado en el servidor · {generatedAt}
        </p>
      </div>

      {/* Summary Table */}
      <div className="glass rounded-2xl overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-xs text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Patrón</th>
                <th className="px-4 py-3 text-right">TTFB</th>
                <th className="px-4 py-3 text-right">FCP</th>
                <th className="px-4 py-3 text-right">LCP</th>
                <th className="px-4 py-3 text-center">SEO</th>
                <th className="px-4 py-3 text-left">Cache-Control</th>
                <th className="px-4 py-3 text-left">Ejecución</th>
                <th className="px-4 py-3 text-center">Streaming</th>
              </tr>
            </thead>
            <tbody>
              {PATTERNS.map((p, i) => (
                <tr
                  key={p.name}
                  className={`border-b border-white/5 hover:bg-white/2 transition-colors ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`badge ${p.badge}`}>{p.name}</span>
                      <span className="text-slate-400 hidden lg:inline">{p.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{p.ttfb}ms</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{p.fcp}ms</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{p.lcp}ms</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <SeoRing score={p.seoScore} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs text-slate-300 bg-white/5 rounded px-1.5 py-0.5 block max-w-[200px] truncate">
                      {p.cacheHeader}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{p.execution}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-lg ${p.streaming ? 'text-cyan-400' : 'text-slate-600'}`}>
                      {p.streaming ? '✓' : '–'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Visual TTFB / FCP / LCP bars */}
      <div className="grid gap-6 md:grid-cols-3 mb-8">
        {(['ttfb', 'fcp', 'lcp'] as const).map((metric) => {
          const max = Math.max(...PATTERNS.map((p) => p[metric] as number));
          return (
            <div key={metric} className="glass rounded-2xl p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">
                {metric.toUpperCase()} (ms) — menor es mejor
              </h3>
              <div className="space-y-3">
                {PATTERNS.map((p) => {
                  const val = p[metric] as number;
                  const color = val <= 100 ? '#10b981' : val <= 300 ? '#f59e0b' : '#ef4444';
                  return (
                    <div key={p.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className={`badge ${p.badge}`}>{p.name}</span>
                        <span className="font-mono text-slate-300">{val}ms</span>
                      </div>
                      <MetricBar value={val} max={max} color={color} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* When to use what */}
      <div className="glass rounded-2xl p-6">
        <h2 className="font-bold text-white mb-4">¿Cuándo usar cada patrón?</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[
            { badge: 'badge-csr', name: 'CSR', use: 'Dashboards privados, filtros dinámicos, estado complejo en cliente.' },
            { badge: 'badge-ssr', name: 'SSR', use: 'Datos en tiempo real, páginas de usuario autenticado, páginas que cambian con cada solicitud.' },
            { badge: 'badge-ssg', name: 'SSG', use: 'Documentación, guías, landing pages, blogs — contenido estable y SEO crítico.' },
            { badge: 'badge-isr', name: 'ISR', use: 'Glosarios, catálogos, precios — contenido que cambia periódicamente pero no en tiempo real.' },
            { badge: 'badge-stream', name: 'Streaming', use: 'Páginas complejas con múltiples secciones lentas; permite TTFB bajo con contenido progresivo.' },
          ].map((item) => (
            <div key={item.name} className="bg-white/5 rounded-xl p-3">
              <span className={`badge ${item.badge} mb-2 block w-fit`}>{item.name}</span>
              <p className="text-xs text-slate-400 leading-relaxed">{item.use}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
