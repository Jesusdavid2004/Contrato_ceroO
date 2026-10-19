import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Rendering Lab — ContratoClaro',
  description: 'Laboratorio de patrones de renderizado Next.js 15: CSR, SSR, SSG, ISR y Streaming SSR.',
};

const PATTERNS = [
  {
    href: '/csr',
    label: 'CSR',
    title: 'Client-Side Rendering',
    desc: 'Dashboard interactivo con filtrado dinámico de cláusulas. Estado gestionado 100% en el navegador.',
    badge: 'badge-csr',
    icon: '⚡',
    metrics: { ttfb: '~80ms', fcp: '~600ms', seo: 'Bajo', cache: 'Sin caché HTTP' },
  },
  {
    href: '/ssr',
    label: 'SSR',
    title: 'Server-Side Rendering',
    desc: 'Jurisprudencia contractual obtenida en tiempo real en cada solicitud. Cache-Control: no-store.',
    badge: 'badge-ssr',
    icon: '🖥️',
    metrics: { ttfb: '~200ms', fcp: '~300ms', seo: 'Excelente', cache: 'no-store' },
  },
  {
    href: '/ssg',
    label: 'SSG',
    title: 'Static Site Generation',
    desc: 'Guías legales pre-renderizadas en tiempo de compilación. Máxima velocidad y SEO perfecto.',
    badge: 'badge-ssg',
    icon: '📄',
    metrics: { ttfb: '~20ms', fcp: '~100ms', seo: 'Perfecto', cache: 'max-age=31536000' },
  },
  {
    href: '/isr',
    label: 'ISR',
    title: 'Incremental Static Regeneration',
    desc: 'Glosario de términos legales regenerado automáticamente cada 60 segundos.',
    badge: 'badge-isr',
    icon: '🔄',
    metrics: { ttfb: '~25ms', fcp: '~110ms', seo: 'Excelente', cache: 'stale-while-revalidate' },
  },
  {
    href: '/streaming',
    label: 'Streaming',
    title: 'Streaming SSR + Suspense',
    desc: 'Diagnóstico contractual progresivo. React Server Components transmiten bloques en paralelo.',
    badge: 'badge-stream',
    icon: '🌊',
    metrics: { ttfb: '~50ms', fcp: '~150ms', seo: 'Bueno', cache: 'Parcial' },
  },
];

export default function HomePage() {
  return (
    <div className="slide-up">
      {/* Hero */}
      <div className="text-center mb-16">
        <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-xs font-semibold text-indigo-300 mb-6">
          <span className="w-2 h-2 bg-indigo-400 rounded-full pulse-ring inline-block" />
          Next.js 15 · App Router · React Server Components
        </div>
        <h1 className="text-5xl font-bold mb-4 gradient-text">
          Rendering Lab
        </h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Laboratorio interactivo que demuestra los <strong className="text-white">5 patrones de renderizado</strong> de
          Next.js 15 con datos reales de contratos legales.
        </p>
      </div>

      {/* Pattern Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {PATTERNS.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="glass rounded-2xl p-6 hover:border-indigo-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/10 group block"
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{p.icon}</span>
              <span className={`badge ${p.badge}`}>{p.label}</span>
            </div>
            <h2 className="text-lg font-bold text-white mb-2 group-hover:text-indigo-300 transition-colors">
              {p.title}
            </h2>
            <p className="text-sm text-slate-400 mb-5 leading-relaxed">{p.desc}</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(p.metrics).map(([k, v]) => (
                <div key={k} className="bg-white/5 rounded-lg p-2">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">{k}</div>
                  <div className="text-xs font-semibold text-slate-200 truncate">{v}</div>
                </div>
              ))}
            </div>
          </Link>
        ))}

        {/* Dashboard CTA */}
        <Link
          href="/dashboard"
          className="glass rounded-2xl p-6 hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10 group block md:col-span-2 lg:col-span-1"
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">📊</span>
            <span className="badge" style={{ background: 'rgba(168,85,247,0.2)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.4)' }}>
              Benchmark
            </span>
          </div>
          <h2 className="text-lg font-bold text-white mb-2 group-hover:text-purple-300 transition-colors">
            Performance Dashboard
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Comparativa visual de TTFB, FCP, LCP, indexabilidad SEO y cabeceras de caché para todos los patrones.
          </p>
        </Link>
      </div>

      {/* Privacy Notice */}
      <div className="glass rounded-xl p-4 flex items-start gap-3 border-emerald-500/20 bg-emerald-500/5">
        <span className="text-xl shrink-0">🔒</span>
        <p className="text-sm text-slate-300">
          <strong className="text-emerald-400">Garantía de Privacidad:</strong>{' '}
          Este laboratorio usa únicamente datos de demostración públicos. Ningún contrato privado de usuario
          es expuesto en páginas estáticas, cachés compartidas ni generación en tiempo de compilación.
        </p>
      </div>
    </div>
  );
}
