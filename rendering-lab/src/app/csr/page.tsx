'use client';

import { useState, useMemo } from 'react';

type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

interface Clause {
  id: string;
  title: string;
  text: string;
  risk: RiskLevel;
  category: string;
  explanation: string;
}

const DEMO_CLAUSES: Clause[] = [
  { id: 'c1', title: 'Cláusula de Terminación Unilateral', risk: 'HIGH', category: 'Terminación', text: 'El arrendador podrá dar por terminado el contrato en cualquier momento sin previo aviso ni indemnización.', explanation: 'Vulnera el art. 518 C.Co. que exige preaviso mínimo de 3 meses.' },
  { id: 'c2', title: 'Incremento de Renta Discrecional', risk: 'HIGH', category: 'Financiero', text: 'El arrendador podrá aumentar el canon en cualquier porcentaje que considere conveniente.', explanation: 'Contrario al IPC anual como límite legal (Ley 820/2003).' },
  { id: 'c3', title: 'Depósito de Garantía 3 Meses', risk: 'MEDIUM', category: 'Financiero', text: 'El arrendatario deberá depositar tres meses de canon como garantía.', explanation: 'Excede el límite de 2 meses establecido por la jurisprudencia.' },
  { id: 'c4', title: 'Prohibición de Subarriendo', risk: 'LOW', category: 'Uso', text: 'Queda prohibido el subarriendo total o parcial del inmueble sin autorización escrita.', explanation: 'Cláusula estándar permitida por la Ley 820/2003.' },
  { id: 'c5', title: 'Cláusula de Mantenimiento', risk: 'MEDIUM', category: 'Obligaciones', text: 'El arrendatario asume todos los costos de mantenimiento, incluyendo daños estructurales.', explanation: 'Los daños estructurales son responsabilidad del arrendador.' },
  { id: 'c6', title: 'Plazo Mínimo de Arrendamiento', risk: 'LOW', category: 'Temporalidad', text: 'El contrato tendrá una duración inicial de doce (12) meses.', explanation: 'Plazo estándar y aceptable en contratos residenciales.' },
  { id: 'c7', title: 'Penalidad por Incumplimiento', risk: 'HIGH', category: 'Financiero', text: 'El incumplimiento de cualquier cláusula genera una multa equivalente al 30% del canon mensual por día.', explanation: 'Penalidad desproporcionada. El límite razonable es 0.5–1% diario.' },
  { id: 'c8', title: 'Derecho de Inspección', risk: 'LOW', category: 'Derechos', text: 'El arrendador podrá inspeccionar el inmueble con preaviso de 48 horas.', explanation: 'Tiempo de preaviso adecuado para proteger la privacidad del arrendatario.' },
];

const RISK_CONFIG = {
  HIGH:   { label: 'Alto Riesgo',   color: 'text-red-400',   bg: 'bg-red-500/10   border-red-500/30',   dot: 'bg-red-400' },
  MEDIUM: { label: 'Riesgo Medio',  color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', dot: 'bg-yellow-400' },
  LOW:    { label: 'Bajo Riesgo',   color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400' },
};

export default function CsrDashboard() {
  const [filterRisk, setFilterRisk] = useState<RiskLevel | 'ALL'>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);

  const categories = useMemo(() => ['ALL', ...Array.from(new Set(DEMO_CLAUSES.map((c) => c.category)))], []);

  const filtered = useMemo(
    () =>
      DEMO_CLAUSES.filter(
        (c) => (filterRisk === 'ALL' || c.risk === filterRisk) && (filterCategory === 'ALL' || c.category === filterCategory),
      ),
    [filterRisk, filterCategory],
  );

  const counts = useMemo(
    () => ({
      HIGH:   DEMO_CLAUSES.filter((c) => c.risk === 'HIGH').length,
      MEDIUM: DEMO_CLAUSES.filter((c) => c.risk === 'MEDIUM').length,
      LOW:    DEMO_CLAUSES.filter((c) => c.risk === 'LOW').length,
    }),
    [],
  );

  return (
    <div className="slide-up">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span className="badge badge-csr">CSR</span>
          <span className="text-slate-500 text-sm">Client-Side Rendering</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard de Cláusulas</h1>
        <p className="text-slate-400">
          Todo el filtrado y estado se gestionan en el navegador. No hay round-trips al servidor para actualizar la lista.
        </p>
      </div>

      {/* Risk Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {(Object.keys(RISK_CONFIG) as RiskLevel[]).map((r) => {
          const cfg = RISK_CONFIG[r];
          return (
            <button
              key={r}
              onClick={() => setFilterRisk(filterRisk === r ? 'ALL' : r)}
              className={`glass rounded-xl p-4 text-left border transition-all ${filterRisk === r ? cfg.bg + ' border' : 'border-transparent hover:border-white/10'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
              </div>
              <div className="text-2xl font-bold text-white">{counts[r]}</div>
              <div className="text-xs text-slate-500">cláusulas</div>
            </button>
          );
        })}
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap mb-6">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
              filterCategory === cat
                ? 'bg-indigo-600 text-white'
                : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            {cat === 'ALL' ? 'Todas las categorías' : cat}
          </button>
        ))}
      </div>

      {/* Clause list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="glass rounded-xl p-8 text-center text-slate-500">
            No hay cláusulas con los filtros seleccionados.
          </div>
        )}
        {filtered.map((clause) => {
          const cfg = RISK_CONFIG[clause.risk];
          const isOpen = expanded === clause.id;
          return (
            <div key={clause.id} className={`glass rounded-xl border ${isOpen ? cfg.bg : 'border-white/5'} transition-all`}>
              <button
                className="w-full p-4 flex items-start gap-4 text-left"
                onClick={() => setExpanded(isOpen ? null : clause.id)}
              >
                <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white text-sm">{clause.title}</span>
                    <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded">{clause.category}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-1">{clause.text}</p>
                </div>
                <span className={`text-xs font-bold ${cfg.color} shrink-0`}>{clause.risk}</span>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-3 slide-up">
                  <p className="text-sm text-slate-300 bg-black/20 rounded-lg p-3 italic">&ldquo;{clause.text}&rdquo;</p>
                  <div className={`text-sm ${cfg.color} bg-black/20 rounded-lg p-3`}>
                    ⚠️ {clause.explanation}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CSR Technical Note */}
      <div className="mt-8 glass rounded-xl p-4 border border-indigo-500/20 bg-indigo-500/5">
        <h3 className="text-sm font-bold text-indigo-300 mb-1">¿Cómo funciona el CSR aquí?</h3>
        <p className="text-xs text-slate-400">
          Este componente está marcado con <code className="text-indigo-300">&apos;use client&apos;</code>. El HTML inicial llega vacío (shell)
          y React hidrata el estado en el navegador. Los filtros, acordeones y contadores se ejecutan en el cliente sin
          llamadas al servidor. Ideal para interfaces altamente interactivas que no requieren indexación SEO inmediata.
        </p>
      </div>
    </div>
  );
}
