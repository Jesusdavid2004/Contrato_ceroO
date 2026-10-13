import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { AlertCircle, ChevronRight, Clock, FileText, Loader2, Trash2, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  ContractApiError,
  deleteContract,
  getContractAnalysisResult,
  listContracts,
  type ContractSummary,
} from '../services/contracts';

function getRiskColor(score: number): string {
  if (score >= 60) return 'text-red-500';
  if (score >= 30) return 'text-yellow-500';
  return 'text-green-500';
}

function getRiskLabel(score: number, t: (key: string) => string): string {
  if (score >= 60) return t('risk.level.high');
  if (score >= 30) return t('risk.level.medium');
  return t('risk.level.low');
}

function ScoreRing({ score }: { score: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 60 ? '#ef4444' : score >= 30 ? '#eab308' : '#22c55e';

  return (
    <svg
      aria-label={`${score}%`}
      role="img"
      width="56"
      height="56"
      viewBox="0 0 56 56"
    >
      <circle
        cx="28"
        cy="28"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        className="text-slate-200 dark:text-slate-700"
      />
      <circle
        cx="28"
        cy="28"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 28 28)"
      />
      <text x="28" y="33" textAnchor="middle" fontSize="11" fontWeight="bold" fill={color}>
        {score}
      </text>
    </svg>
  );
}

export function History() {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<ContractSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    if (!token) return;
    void listContracts(token)
      .then((items) => {
        if (isCurrent) setContracts(items);
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setLoadingError(error instanceof ContractApiError ? error.messageKey : 'errors.api_error');
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [reloadKey, token]);

  const openContract = async (contract: ContractSummary) => {
    if (!token || contract.status !== 'READY') return;
    setOpeningId(contract.id);
    setActionError(null);
    try {
      const contractData = await getContractAnalysisResult(contract.id, token);
      navigate('/results', { state: { contractData } });
    } catch (error: unknown) {
      setActionError(error instanceof ContractApiError ? error.messageKey : 'errors.api_error');
    } finally {
      setOpeningId(null);
    }
  };

  const removeContract = async (contract: ContractSummary) => {
    if (!token || !window.confirm(t('history.confirm_delete', { title: contract.title }))) return;
    setDeletingId(contract.id);
    setActionError(null);
    try {
      await deleteContract(contract.id, token);
      setContracts((current) => current.filter((item) => item.id !== contract.id));
    } catch (error: unknown) {
      setActionError(error instanceof ContractApiError ? error.messageKey : 'errors.api_error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold">{t('history.title')}</h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400">{t('history.subtitle')}</p>
        </div>
        <div className="glass flex items-center space-x-2 rounded-full px-4 py-2 text-sm">
          <TrendingUp aria-hidden="true" className="h-4 w-4 text-blue-500" />
          <span>{t('history.total', { count: contracts.length })}</span>
        </div>
      </motion.div>

      {loadingError && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-red-300 p-4 text-red-700 dark:border-red-900 dark:text-red-300">
          <span>{t(loadingError, { defaultValue: t('errors.api_error') })}</span>
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm"
            onClick={() => {
              setIsLoading(true);
              setLoadingError(null);
              setReloadKey((current) => current + 1);
            }}
          >
            {t('history.retry')}
          </button>
        </div>
      )}

      {isLoading && (
        <div role="status" className="flex items-center justify-center gap-3 py-12">
          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
          <span>{t('history.loading')}</span>
        </div>
      )}

      {!isLoading && !loadingError && contracts.length === 0 && (
        <div className="glass flex flex-col items-center gap-3 rounded-2xl p-10 text-center">
          <FileText aria-hidden="true" className="h-8 w-8 text-slate-400" />
          <p>{t('history.empty')}</p>
        </div>
      )}

      {!isLoading && contracts.length > 0 && (
        <div className="space-y-4">
          {contracts.map((contract, index) => {
            const isOpening = openingId === contract.id;
            const isDeleting = deletingId === contract.id;
            const isReady = contract.status === 'READY';
            const displayTitle = contract.title || contract.file_name;

            return (
              <motion.div
                key={contract.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="glass flex items-center gap-4 rounded-2xl p-5"
              >
                <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                  <FileText aria-hidden="true" className="h-6 w-6 text-blue-500" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{displayTitle}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                    <span>{new Intl.DateTimeFormat(i18n.language).format(new Date(contract.uploaded_at))}</span>
                    <span className={`font-medium ${getRiskColor(contract.global_risk_score)}`}>
                      {getRiskLabel(contract.global_risk_score, t)}
                    </span>
                    <span>{t(`history.status.${contract.status}`, { defaultValue: contract.status })}</span>
                  </div>
                </div>

                <ScoreRing score={contract.global_risk_score} />

                <button
                  type="button"
                  aria-label={t('history.open_contract', { title: displayTitle })}
                  title={t('history.open')}
                  disabled={!isReady || isOpening || isDeleting}
                  onClick={() => void openContract(contract)}
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-blue-900/20"
                >
                  {isOpening
                    ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
                    : <ChevronRight aria-hidden="true" className="h-5 w-5" />}
                </button>

                <button
                  type="button"
                  aria-label={t('history.delete_contract', { title: displayTitle })}
                  title={t('history.delete')}
                  disabled={isDeleting || isOpening}
                  onClick={() => void removeContract(contract)}
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-900/20"
                >
                  {isDeleting
                    ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                    : <Trash2 aria-hidden="true" className="h-4 w-4" />}
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {actionError && !loadingError && (
        <p role="alert" className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle aria-hidden="true" className="h-4 w-4" />
          {t(actionError, { defaultValue: t('errors.api_error') })}
        </p>
      )}
    </div>
  );
}
