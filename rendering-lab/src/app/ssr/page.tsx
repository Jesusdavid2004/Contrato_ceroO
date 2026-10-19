import type { Metadata } from 'next';

export const dynamic = 'force-dynamic'; // SSR: no-cache, rendered per request

export const metadata: Metadata = {
  title: 'Jurisprudencia Contractual — SSR | ContratoClaro Lab',
  description: 'Normativas y jurisprudencia sobre contratos de arrendamiento en Colombia, renderizadas en el servidor en cada solicitud.',
};

// Simulated data that changes per-request (timestamp proves SSR)
const LEGAL_RULES = [
  {
    id: 'ley-820-2003',
    title: 'Ley 820 de 2003',
    subtitle: 'Estatuto del Arrendamiento Urbano de Vivienda',
    articles: [
      { num: 'Art. 3', text: 'El arrendatario tiene derecho a la renovación automática del contrato salvo causales legales de terminación.' },
      { num: 'Art. 20', text: 'El incremento del canon de arrendamiento no podrá exceder el IPC del año inmediatamente anterior.' },
      { num: 'Art. 29', text: 'El depósito de garantía no podrá superar el equivalente a dos (2) mensualidades del canon de arrendamiento.' },
    ],
    severity: 'info',
  },
  {
    id: 'cc-art-518',
    title: 'Código de Comercio — Art. 518',
    subtitle: 'Renovación de Contratos Comerciales',
    articles: [
      { num: 'Art. 518', text: 'El empresario que haya ocupado no menos de dos años consecutivos tiene derecho a la renovación del contrato.' },
      { num: 'Art. 520', text: 'La indemnización por no renovación injustificada equivale a los cánones correspondientes a seis meses de arrendamiento.' },
    ],
    severity: 'warning',
  },
  {
    id: 'sentencia-c-595',
    title: 'Sentencia C-595/99 — Corte Constitucional',
    subtitle: 'Constitucionalidad del régimen de arrendamiento',
    articles: [
      { num: 'Ratio', text: 'Las cláusulas que otorguen al arrendador la facultad de modificar unilateralmente las condiciones esenciales del contrato son nulas de pleno derecho.' },
      { num: 'Obiter', text: 'El principio de buena fe contractual impone deberes de información y equilibrio en la distribución de riesgos.' },
    ],
    severity: 'danger',
  },
];

const SEVERITY_STYLE = {
  info:    'border-blue-500/30 bg-blue-500/5',
  warning: 'border-yellow-500/30 bg-yellow-500/5',
  danger:  'border-red-500/30 bg-red-500/5',
};



export default async function SsrPage() {
  // Simulate async data fetch — proves this is SSR (timestamp is server-side)
  const renderedAt = new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'long',
    timeStyle: 'medium',
  });

  // Small simulated delay to illustrate async SSR data fetching
  await new Promise((r) => setTimeout(r, 40));

  return (
    <div className="slide-up">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span className="badge badge-ssr">SSR</span>
          <span className="text-slate-500 text-sm">Server-Side Rendering · cache: no-store</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Jurisprudencia Contractual</h1>
        <p className="text-slate-400 mb-3">
          Esta página se renderiza completamente en el servidor en cada solicitud. El HTML que recibe el navegador
          contiene el contenido completo — sin JavaScript necesario para ver los datos.
        </p>
        {/* SSR Proof Badge */}
        <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-xs border border-emerald-500/20 bg-emerald-500/5">
          <span className="w-2 h-2 bg-emerald-400 rounded-full" />
          <span className="text-emerald-300 font-mono">
            Renderizado en servidor: {renderedAt}
          </span>
        </div>
      </div>

      {/* Legal rules */}
      <div className="space-y-6">
        {LEGAL_RULES.map((rule) => (
          <article
            key={rule.id}
            className={`glass rounded-2xl p-6 border ${SEVERITY_STYLE[rule.severity as keyof typeof SEVERITY_STYLE]}`}
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-1">
                <h2 className="text-lg font-bold text-white mb-1">{rule.title}</h2>
                <p className="text-sm text-slate-400">{rule.subtitle}</p>
              </div>
              <span
                className={`badge text-xs ${
                  rule.severity === 'info'
                    ? 'badge-ssr'
                    : rule.severity === 'warning'
                      ? 'badge-ssg'
                      : 'text-red-400 bg-red-500/10 border-red-500/30'
                }`}
              >
                {rule.severity === 'info' ? 'Vigente' : rule.severity === 'warning' ? 'Atención' : 'Nulo'}
              </span>
            </div>
            <div className="space-y-3">
              {rule.articles.map((a, i) => (
                <div key={i} className="bg-black/20 rounded-xl p-4">
                  <span className="text-xs font-bold text-indigo-400 block mb-1">{a.num}</span>
                  <p className="text-sm text-slate-300 leading-relaxed">{a.text}</p>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      {/* SSR Technical Note */}
      <div className="mt-8 glass rounded-xl p-4 border border-emerald-500/20 bg-emerald-500/5">
        <h3 className="text-sm font-bold text-emerald-300 mb-1">¿Cómo funciona el SSR aquí?</h3>
        <p className="text-xs text-slate-400">
          Este archivo es un <strong className="text-white">React Server Component (RSC)</strong> sin directiva{' '}
          <code className="text-emerald-300">&apos;use client&apos;</code>. El export{' '}
          <code className="text-emerald-300">dynamic = &apos;force-dynamic&apos;</code> garantiza que Next.js no cachea la respuesta —
          equivalente a <code className="text-emerald-300">fetch(..., {'{'} cache: &apos;no-store&apos; {'}'})</code>. Cada solicitud genera HTML fresco en el
          servidor Node.js y el navegador lo recibe completo sin necesitar JavaScript para visualizar el contenido.
        </p>
      </div>
    </div>
  );
}
