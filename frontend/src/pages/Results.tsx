import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle, Info, ArrowLeft, Download } from 'lucide-react';

export function Results() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const data = location.state?.contractData;

  if (!data || !data.clauses) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <p className="text-xl text-red-500 font-semibold">Error al analizar el contrato.</p>
        <p className="text-slate-500 text-sm">Asegúrate de que el backend esté corriendo en el puerto 3001.</p>
        <button onClick={() => navigate('/')} className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          Intentar de nuevo
        </button>
      </div>
    );
  }

  const getRiskStyles = (level: string) => {
    switch(level) {
      case 'high': return 'bg-[var(--color-risk-high-bg)] text-[var(--color-risk-high-text)] border-red-200 dark:border-red-900/50';
      case 'medium': return 'bg-[var(--color-risk-medium-bg)] text-[var(--color-risk-medium-text)] border-yellow-200 dark:border-yellow-900/50';
      default: return 'bg-[var(--color-risk-low-bg)] text-[var(--color-risk-low-text)] border-green-200 dark:border-green-900/50';
    }
  };

  const getRiskIcon = (level: string) => {
    switch(level) {
      case 'high': return <AlertTriangle className="h-5 w-5" />;
      case 'medium': return <Info className="h-5 w-5" />;
      default: return <CheckCircle className="h-5 w-5" />;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-8"
    >
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/')} className="flex items-center space-x-2 text-slate-500 hover:text-blue-500 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          <span>{t('results.back', 'Back to upload')}</span>
        </button>
        <div className="glass px-4 py-2 rounded-full font-bold flex items-center space-x-2">
          <span>{t('results.score', 'Global Risk Score')}:</span>
          <span className={data.global_risk_score > 50 ? 'text-red-500' : 'text-green-500'}>
            {data.global_risk_score}/100
          </span>
        </div>
      </div>

      <div className="space-y-6">
        {data.clauses.map((clause: any) => (
          <div key={clause.id} className={`p-6 rounded-2xl border transition-all hover:shadow-lg ${getRiskStyles(clause.risk_level)}`}>
            <div className="flex items-start space-x-4">
              <div className="mt-1">{getRiskIcon(clause.risk_level)}</div>
              <div className="space-y-3 flex-1">
                <p className="font-medium text-lg opacity-90 leading-relaxed">"{clause.text}"</p>
                
                {clause.risk_level !== 'low' && (
                  <div className="bg-white/50 dark:bg-black/20 p-4 rounded-xl space-y-2 mt-4">
                    <p className="font-semibold text-sm uppercase tracking-wider opacity-70">
                      {t('results.explanation', 'Simple Explanation')}
                    </p>
                    <p>{clause.plain_explanation}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center pt-8">
        <button className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all shadow-xl shadow-blue-500/30 hover:scale-105">
          <Download className="h-6 w-6" />
          <span>{t('letter.generate_button', 'Generate Objection Letter')}</span>
        </button>
      </div>
    </motion.div>
  );
}
