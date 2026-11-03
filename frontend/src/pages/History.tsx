import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { AlertCircle, ChevronRight, Clock, FileText, Loader2, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  ContractApiError,
  deleteContract,
  getContractAnalysisResult,
  listContracts,
  type ContractSummary,
} from '../services/contracts';
import { RiskScore } from '../components/ui/Risk';
import { SectionHeader } from '../components/ui/Panel';
import { EmptyState } from '../components/ui/Fields';

type RiskFilter = 'all' | 'low' | 'medium' | 'high';

function riskOf(score: number): Exclude<RiskFilter, 'all'> {
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
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
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RiskFilter>('all');

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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contracts.filter((c) => {
      if (filter !== 'all' && riskOf(c.global_risk_score) !== filter) return false;
      if (!q) return true;
      return (c.title || c.file_name).toLowerCase().includes(q);
    });
  }, [contracts, query, filter]);

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

  const filters: RiskFilter[] = ['all', 'low', 'medium', 'high'];

  return (
    <div className="space-y-5">
      <SectionHeader
        title={t('history.title')}
        subtitle={t('history.subtitle')}
        action={
          <span className="rounded-full bg-[var(--color-surface)] px-4 py-1.5 text-[13px] font-semibold text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)]">
            {t('history.total', { count: contracts.length })}
          </span>
        }
      />

      {!isLoading && !loadingError && contracts.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <span className="sr-only">{t('history.search')}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('history.search')}
              className="w-full rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-10 pr-4 text-[14px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-action)] focus:outline-none"
            />
          </label>
          <div role="group" aria-label={t('history.search')} className="flex gap-1.5">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  filter === f
                    ? 'bg-[var(--color-action)] text-white'
                    : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)] hover:text-[var(--color-text)]'
                }`}
              >
                {t(`history.filter.${f}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {loadingError && (
        <div role="alert" className="floating-card flex items-center justify-between gap-4 border-red-200! text-red-600 dark:border-red-500/20! dark:text-red-300">
          <span className="text-[14px] font-medium">{t(loadingError, { defaultValue: t('errors.api_error') })}</span>
          <button
            type="button"
            className="rounded-[12px] border border-[var(--color-border)] px-3 py-2 text-[13px] font-semibold"
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
        <div role="status" className="flex items-center justify-center gap-2.5 py-14 text-[var(--color-text-muted)]">
          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
          <span className="text-[14px]">{t('history.loading')}</span>
        </div>
      )}

      {!isLoading && !loadingError && contracts.length === 0 && (
        <EmptyState icon={<FileText aria-hidden="true" className="h-6 w-6" />} title={t('history.empty')} />
      )}

      {!isLoading && !loadingError && contracts.length > 0 && visible.length === 0 && (
        <EmptyState icon={<Search aria-hidden="true" className="h-6 w-6" />} title={t('history.no_results')} />
      )}

      {!isLoading && visible.length > 0 && (
        <div className="space-y-3">
          {visible.map((contract, index) => {
            const isOpening = openingId === contract.id;
            const isDeleting = deletingId === contract.id;
            const isReady = contract.status === 'READY';
            const displayTitle = contract.title || contract.file_name;

            return (
              <motion.div
                key={contract.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.2) }}
                className="floating-card flex items-center gap-4 p-4!"
              >
                <span className="hidden rounded-[14px] bg-[var(--color-surface-2)] p-3 sm:block">
                  <FileText aria-hidden="true" className="h-5 w-5 text-[var(--color-action-text)]" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{displayTitle}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-[var(--color-text-muted)]">
                    <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                    <span>{new Intl.DateTimeFormat(i18n.language).format(new Date(contract.uploaded_at))}</span>
                    <span>{t(`history.status.${contract.status}`, { defaultValue: contract.status })}</span>
                  </div>
                </div>

                <RiskScore score={contract.global_risk_score} size={52} />

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={t('history.open_contract', { title: displayTitle })}
                    title={t('history.open')}
                    disabled={!isReady || isOpening || isDeleting}
                    onClick={() => void openContract(contract)}
                    className="rounded-[12px] p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-action-soft)] hover:text-[var(--color-action-text)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isOpening ? (
                      <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
                    ) : (
                      <ChevronRight aria-hidden="true" className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={t('history.delete_contract', { title: displayTitle })}
                    title={t('history.delete')}
                    disabled={isDeleting || isOpening}
                    onClick={() => void removeContract(contract)}
                    className="rounded-[12px] p-2 text-[var(--color-text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"
                  >
                    {isDeleting ? (
                      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {actionError && !loadingError && (
        <p role="alert" className="flex items-center gap-2 text-[13px] font-medium text-[var(--color-risk-high-text)]">
          <AlertCircle aria-hidden="true" className="h-4 w-4" />
          {t(actionError, { defaultValue: t('errors.api_error') })}
        </p>
      )}
    </div>
  );
}
