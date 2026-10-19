import type { Metadata } from 'next';

// ISR: revalidate every 60 seconds
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Glosario de Términos Contractuales — ISR | ContratoClaro Lab',
  description:
    'Glosario de términos legales contractuales con regeneración incremental cada 60 segundos.',
};

const GLOSSARY_TERMS = [
  { term: 'Arrendador', definition: 'Persona natural o jurídica que cede el uso y goce de un bien inmueble a cambio del pago de un canon periódico.' },
  { term: 'Arrendatario', definition: 'Persona que recibe el uso y goce del bien inmueble y se obliga al pago del canon pactado.' },
  { term: 'Canon de Arrendamiento', definition: 'Precio cierto que el arrendatario paga periódicamente al arrendador por el uso y goce del bien inmueble.' },
  { term: 'Cláusula Abusiva', definition: 'Estipulación contractual que genera un desequilibrio significativo entre los derechos y obligaciones de las partes en perjuicio de la parte más débil.' },
  { term: 'Depósito de Garantía', definition: 'Suma de dinero entregada al arrendador para garantizar el cumplimiento del contrato. Limitado legalmente a dos mensualidades.' },
  { term: 'Incumplimiento', definition: 'Falta de ejecución total o parcial de las obligaciones pactadas en el contrato por cualquiera de las partes.' },
  { term: 'IPC', definition: 'Índice de Precios al Consumidor. Indicador macroeconómico usado como límite legal para el incremento anual del canon de arrendamiento.' },
  { term: 'Paz y Salvo', definition: 'Documento mediante el cual el arrendador certifica que el arrendatario ha cumplido con todas sus obligaciones contractuales.' },
  { term: 'Preaviso', definition: 'Notificación anticipada que debe darse para terminar el contrato o modificar condiciones esenciales. Generalmente de 3 meses.' },
  { term: 'Prestaciones Sociales', definition: 'Beneficios extralegales o legales a los que tiene derecho el trabajador: prima de servicios, cesantías, vacaciones, intereses a cesantías.' },
  { term: 'Subordinación', definition: 'Elemento esencial del contrato de trabajo que implica la facultad del empleador de impartir instrucciones sobre el modo, tiempo y lugar del trabajo.' },
  { term: 'Terminación Unilateral', definition: 'Facultad de una de las partes de dar por finalizado el contrato sin necesidad del consentimiento de la otra, sujeta a condiciones y avisos previstos en la ley.' },
];

function getRevalidationInfo() {
  // This runs on the server — the timestamp proves ISR
  return {
    time: new Date().toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'medium',
      timeStyle: 'medium',
    }),
    nextRevalidation: new Date(Date.now() + 60_000).toLocaleTimeString('es-CO', {
      timeZone: 'America/Bogota',
      timeStyle: 'medium',
    }),
  };
}

export default async function IsrPage() {
  // Simulated async data source
  await new Promise((r) => setTimeout(r, 20));
  const info = getRevalidationInfo();

  return (
    <div className="slide-up">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span className="badge badge-isr">ISR</span>
          <span className="text-slate-500 text-sm">Incremental Static Regeneration · revalidate: 60s</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Glosario de Términos Contractuales</h1>
        <p className="text-slate-400 mb-3">
          Esta página se sirve estáticamente pero se regenera automáticamente cada 60 segundos en el servidor.
          Los usuarios siempre reciben contenido fresco sin sacrificar velocidad.
        </p>
        <div className="flex flex-wrap gap-3">
          <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-xs border border-pink-500/20 bg-pink-500/5">
            <span className="w-2 h-2 bg-pink-400 rounded-full pulse-ring" />
            <span className="text-pink-300 font-mono">Generado: {info.time}</span>
          </div>
          <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-xs border border-pink-500/20 bg-pink-500/5">
            <span className="text-pink-300 font-mono">Próxima revalidación: ~{info.nextRevalidation}</span>
          </div>
        </div>
      </div>

      {/* Glossary Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {GLOSSARY_TERMS.map((item) => (
          <div key={item.term} className="glass rounded-xl p-4 border border-pink-500/10 hover:border-pink-500/30 transition-colors">
            <h2 className="text-sm font-bold text-pink-300 mb-2">{item.term}</h2>
            <p className="text-xs text-slate-400 leading-relaxed">{item.definition}</p>
          </div>
        ))}
      </div>

      {/* ISR Technical Note */}
      <div className="mt-8 glass rounded-xl p-4 border border-pink-500/20 bg-pink-500/5">
        <h3 className="text-sm font-bold text-pink-300 mb-1">¿Cómo funciona el ISR aquí?</h3>
        <p className="text-xs text-slate-400">
          El export <code className="text-pink-300">revalidate = 60</code> activa la estrategia{' '}
          <strong className="text-white">stale-while-revalidate</strong> de Next.js. La primera solicitud sirve la versión
          estática en caché. En segundo plano, Next.js regenera la página en el servidor si han pasado más de 60 segundos.
          La siguiente solicitud recibirá la versión actualizada. Esto combina la velocidad del SSG con la frescura del SSR.
        </p>
      </div>
    </div>
  );
}
