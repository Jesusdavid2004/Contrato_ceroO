import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { FileText, Clock, Trash2, ChevronRight, TrendingUp } from 'lucide-react';

// Mock history data — will be replaced with real API calls after auth is wired up
const MOCK_HISTORY = [
  { id: '1', file_name: 'Lease_Agreement_2024.pdf', uploaded_at: '2026-09-20', global_risk_score: 72 },
  { id: '2', file_name: 'Freelance_Services_Contract.pdf', uploaded_at: '2026-09-15', global_risk_score: 35 },
  { id: '3', file_name: 'Employment_Contract_Acme.pdf', uploaded_at: '2026-09-01', global_risk_score: 88 },
];

function getRiskColor(score: number) {
  if (score >= 60) return 'text-red-500';
  if (score >= 30) return 'text-yellow-500';
  return 'text-green-500';
}

function getRiskLabel(score: number, t: (k: string, d: string) => string) {
  if (score >= 60) return t('risk.level.high', 'High risk');
  if (score >= 30) return t('risk.level.medium', 'Medium risk');
  return t('risk.level.low', 'Low risk');
}

function ScoreRing({ score }: { score: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 60 ? '#ef4444' : score >= 30 ? '#eab308' : '#22c55e';

  return (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r={radius} fill="none" stroke="currentColor" strokeWidth="4" className="text-slate-200 dark:text-slate-700" />
      <circle
        cx="28" cy="28" r={radius}
        fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 28 28)"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text x="28" y="33" textAnchor="middle" fontSize="11" fontWeight="bold" fill={color}>
        {score}
      </text>
    </svg>
  );
}

export function History() {
  const { t } = useTranslation();

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('history.title', 'Contract History')}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t('history.subtitle', 'All your previously analyzed contracts')}</p>
        </div>
        <div className="glass px-4 py-2 rounded-full flex items-center space-x-2 text-sm">
          <TrendingUp className="h-4 w-4 text-blue-500" />
          <span>{MOCK_HISTORY.length} {t('history.total', 'contracts')}</span>
        </div>
      </motion.div>

      <div className="space-y-4">
        {MOCK_HISTORY.map((contract, i) => (
          <motion.div
            key={contract.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass rounded-2xl p-5 flex items-center space-x-4 group hover:shadow-xl hover:scale-[1.01] transition-all cursor-pointer"
          >
            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <FileText className="h-6 w-6 text-blue-500" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{contract.file_name}</p>
              <div className="flex items-center space-x-2 text-sm text-slate-500 dark:text-slate-400 mt-1">
                <Clock className="h-3.5 w-3.5" />
                <span>{new Date(contract.uploaded_at).toLocaleDateString()}</span>
                <span>·</span>
                <span className={`font-medium ${getRiskColor(contract.global_risk_score)}`}>
                  {getRiskLabel(contract.global_risk_score, t)}
                </span>
              </div>
            </div>

            <ScoreRing score={contract.global_risk_score} />

            <div className="flex items-center space-x-2">
              <button
                aria-label="Delete contract"
                className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
