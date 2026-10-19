import type { Metadata } from 'next';

// SSG: rendered at build time — no revalidation
export const dynamic = 'force-static';

// generateStaticParams — pre-renders a set of guide slugs at build time
export async function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

const GUIDES = [
  { slug: 'arrendamiento-urbano', title: 'Guía de Arrendamiento Urbano', icon: '🏠' },
  { slug: 'contratos-laborales',  title: 'Guía de Contratos Laborales',  icon: '👷' },
  { slug: 'servicios-civiles',    title: 'Guía de Servicios Civiles',    icon: '📋' },
];

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Guías Legales — SSG | ContratoClaro Lab',
    description:
      'Guías legales educativas sobre contratos de arrendamiento, laborales y de servicios, pre-generadas en tiempo de compilación.',
  };
}

const GUIDE_CONTENT: Record<string, { sections: { heading: string; body: string }[] }> = {
  'arrendamiento-urbano': {
    sections: [
      { heading: '¿Qué es un contrato de arrendamiento urbano?', body: 'Es el acuerdo por el cual el arrendador cede el uso y goce de un inmueble urbano al arrendatario por un tiempo determinado y a cambio de un precio cierto (canon). Se rige principalmente por la Ley 820 de 2003.' },
      { heading: 'Obligaciones del arrendador', body: 'Entregar el inmueble en buen estado, mantenerlo en condiciones habitables, garantizar la posesión pacífica, realizar las reparaciones estructurales necesarias y expedir paz y salvo al finalizar el contrato.' },
      { heading: 'Obligaciones del arrendatario', body: 'Pagar el canon en los plazos pactados, conservar el inmueble en buen estado, usar el bien conforme al destino pactado, no subarrendar sin autorización y restituirlo al vencimiento del plazo.' },
      { heading: 'Límites al incremento del canon', body: 'El canon no puede incrementarse más allá del IPC del año anterior. Cualquier cláusula que permita incrementos superiores es nula de pleno derecho.' },
    ],
  },
  'contratos-laborales': {
    sections: [
      { heading: '¿Qué es un contrato de trabajo?', body: 'Es el acuerdo por el cual una persona natural se obliga a prestar un servicio personal a otra persona natural o jurídica, bajo dependencia continuada, a cambio de una remuneración. Se rige por el Código Sustantivo del Trabajo.' },
      { heading: 'Elementos esenciales', body: 'Para que exista contrato de trabajo deben concurrir: actividad personal, subordinación continuada y salario. La presunción legal opera en favor del trabajador.' },
      { heading: 'Cláusulas abusivas frecuentes', body: 'Renuncia anticipada a prestaciones sociales, cláusulas de exclusividad sin compensación, pactos que desnaturalizan la subordinación para eludir el vínculo laboral, y penalidades desproporcionadas por terminación.' },
      { heading: 'Prestaciones mínimas irrenunciables', body: 'Prima de servicios, vacaciones, cesantías, intereses a cesantías, dotación y afiliación obligatoria a seguridad social. Ninguna cláusula contractual puede renunciar a estas prestaciones.' },
    ],
  },
  'servicios-civiles': {
    sections: [
      { heading: '¿Qué es un contrato de prestación de servicios?', body: 'Es un contrato civil o comercial por el cual una persona natural o jurídica se compromete a ejecutar una obra o prestar un servicio a cambio de un precio. No genera vínculo laboral si hay autonomía e independencia real.' },
      { heading: 'Riesgo de recaracterización laboral', body: 'Si el contratante ejerce subordinación sobre el contratista (horarios, instrucciones, exclusividad), la relación puede ser recaracterizada como laboral, con todas las prestaciones que ello implica.' },
      { heading: 'Cláusulas de confidencialidad', body: 'Son válidas siempre que sean proporcionales, limitadas en el tiempo y no impidan el ejercicio profesional del contratista. Las cláusulas de confidencialidad perpetua son inaplicables.' },
      { heading: 'Terminación y responsabilidad', body: 'Cualquier parte puede terminar el contrato con previo aviso razonable. La terminación intempestiva sin justa causa genera responsabilidad por daños y perjuicios.' },
    ],
  },
};

export default function SsgPage() {
  const builtAt = new Date().toLocaleDateString('es-CO', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="slide-up">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span className="badge badge-ssg">SSG</span>
          <span className="text-slate-500 text-sm">Static Site Generation · Build time</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Guías Legales Educativas</h1>
        <p className="text-slate-400 mb-3">
          Estas páginas son pre-generadas en tiempo de compilación (<code className="text-yellow-300">npm run build</code>).
          El servidor entrega HTML estático con latencia mínima y máximo puntaje SEO.
        </p>
        <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-xs border border-yellow-500/20 bg-yellow-500/5">
          <span className="w-2 h-2 bg-yellow-400 rounded-full" />
          <span className="text-yellow-300 font-mono">
            Compilado estáticamente · {builtAt}
          </span>
        </div>
      </div>

      {/* Guide Selector */}
      <div className="flex gap-3 flex-wrap mb-8">
        {GUIDES.map((g) => (
          <div
            key={g.slug}
            className="glass rounded-xl px-4 py-3 border border-yellow-500/20 text-sm font-medium text-slate-300 flex items-center gap-2"
          >
            <span>{g.icon}</span>
            <span>{g.title}</span>
          </div>
        ))}
      </div>

      {/* All guide content (SSG renders all at build time) */}
      <div className="space-y-8">
        {GUIDES.map((guide) => {
          const content = GUIDE_CONTENT[guide.slug];
          return (
            <article key={guide.slug} className="glass rounded-2xl p-6 border border-yellow-500/10">
              <div className="flex items-center gap-3 mb-6">
                <span className="text-3xl">{guide.icon}</span>
                <div>
                  <h2 className="text-xl font-bold text-white">{guide.title}</h2>
                  <code className="text-xs text-yellow-400">/ssg/{guide.slug}</code>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {content.sections.map((sec, i) => (
                  <div key={i} className="bg-black/20 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-yellow-300 mb-2">{sec.heading}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{sec.body}</p>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      {/* SSG Technical Note */}
      <div className="mt-8 glass rounded-xl p-4 border border-yellow-500/20 bg-yellow-500/5">
        <h3 className="text-sm font-bold text-yellow-300 mb-1">¿Cómo funciona el SSG aquí?</h3>
        <p className="text-xs text-slate-400">
          <code className="text-yellow-300">dynamic = &apos;force-static&apos;</code> + <code className="text-yellow-300">generateStaticParams()</code> le
          indican a Next.js que pre-renderice estas rutas durante <code className="text-yellow-300">next build</code>. El resultado son
          archivos HTML + JSON estáticos servidos por CDN con{' '}
          <code className="text-yellow-300">Cache-Control: public, max-age=31536000, immutable</code>. TTFB típico: ~20ms.
          El contenido nunca expone datos privados de usuarios.
        </p>
      </div>
    </div>
  );
}
