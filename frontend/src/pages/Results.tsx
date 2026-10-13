import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle,
  Copy,
  Download,
  FileDown,
  Info,
  Loader2,
  Save,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  ContractApiError,
  downloadObjectionLetterPdf,
  generateObjectionLetter,
  isContractAnalysisResult,
  updateObjectionLetter,
} from '../services/contracts';

type PlaceholderField = 'name' | 'recipient' | 'date' | 'reference';
type PlaceholderValues = Record<PlaceholderField, string>;

const EMPTY_PLACEHOLDERS: PlaceholderValues = {
  name: '',
  recipient: '',
  date: '',
  reference: '',
};

const PLACEHOLDER_TOKENS: Record<'en' | 'es', Record<PlaceholderField, string>> = {
  en: {
    name: '[YOUR NAME]',
    recipient: '[RECIPIENT]',
    date: '[DATE]',
    reference: '[CONTRACT REFERENCE]',
  },
  es: {
    name: '[SU NOMBRE]',
    recipient: '[DESTINATARIO]',
    date: '[FECHA]',
    reference: '[REFERENCIA DEL CONTRATO]',
  },
};

export function Results() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { token } = useAuth();
  const shouldReduceMotion = useReducedMotion();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [letterContent, setLetterContent] = useState('');
  const [letterLocale, setLetterLocale] = useState<'en' | 'es'>('en');
  const [placeholders, setPlaceholders] = useState<PlaceholderValues>(EMPTY_PLACEHOLDERS);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [statusKey, setStatusKey] = useState<string | null>(null);
  const dataState = (location.state as { contractData?: unknown } | null)?.contractData;

  const localizedTokens = PLACEHOLDER_TOKENS[letterLocale];
  const preview = useMemo(
    () => (Object.entries(placeholders) as [PlaceholderField, string][]).reduce(
      (content, [field, value]) => value.trim()
        ? content.split(localizedTokens[field]).join(value.trim())
        : content,
      letterContent,
    ),
    [letterContent, localizedTokens, placeholders],
  );

  if (!isContractAnalysisResult(dataState)) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-4">
        <p className="text-xl font-semibold text-red-500">{t('results.invalid_data')}</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 rounded-lg bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700"
        >
          {t('results.try_again')}
        </button>
      </div>
    );
  }

  const data = dataState;
  const flaggedClauses = data.clauses.filter((clause) => clause.risk_level !== 'low');
  const getRiskStyles = (level: string) => {
    switch (level) {
      case 'high':
        return 'bg-[var(--color-risk-high-bg)] text-[var(--color-risk-high-text)] border-red-200 dark:border-red-900/50';
      case 'medium':
        return 'bg-[var(--color-risk-medium-bg)] text-[var(--color-risk-medium-text)] border-yellow-200 dark:border-yellow-900/50';
      default:
        return 'bg-[var(--color-risk-low-bg)] text-[var(--color-risk-low-text)] border-green-200 dark:border-green-900/50';
    }
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'high': return <AlertTriangle aria-hidden="true" className="h-5 w-5" />;
      case 'medium': return <Info aria-hidden="true" className="h-5 w-5" />;
      default: return <CheckCircle aria-hidden="true" className="h-5 w-5" />;
    }
  };

  const errorMessage = (error: unknown) => (
    error instanceof ContractApiError ? error.messageKey : 'errors.api_error'
  );

  const handleGenerate = async () => {
    if (!token || !flaggedClauses.length) return;
    setErrorKey(null);
    setStatusKey(null);
    setIsGenerating(true);
    try {
      const letter = await generateObjectionLetter(data.id, token);
      setLetterContent(letter.content);
      setLetterLocale(letter.locale.startsWith('es') ? 'es' : 'en');
      setPlaceholders(EMPTY_PLACEHOLDERS);
    } catch (error: unknown) {
      setErrorKey(errorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  };

  const persistLetter = async () => {
    if (!token) throw new ContractApiError('errors.unauthorized');
    const saved = await updateObjectionLetter(data.id, preview, token);
    setLetterContent(saved.content);
    setPlaceholders(EMPTY_PLACEHOLDERS);
  };

  const handleSave = async () => {
    setErrorKey(null);
    setStatusKey(null);
    setIsSaving(true);
    try {
      await persistLetter();
      setStatusKey('letter.saved');
    } catch (error: unknown) {
      setErrorKey(errorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async () => {
    setErrorKey(null);
    setStatusKey(null);
    try {
      await navigator.clipboard.writeText(preview);
      setStatusKey('letter.copied');
    } catch {
      setErrorKey('errors.clipboard_unavailable');
    }
  };

  const handleDownload = async () => {
    if (!token) {
      setErrorKey('errors.unauthorized');
      return;
    }
    setErrorKey(null);
    setStatusKey(null);
    setIsDownloading(true);
    try {
      await persistLetter();
      const pdf = await downloadObjectionLetterPdf(data.id, token);
      const url = URL.createObjectURL(pdf);
      const link = document.createElement('a');
      link.href = url;
      link.download = t('letter.download_filename');
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setStatusKey('letter.downloaded');
    } catch (error: unknown) {
      setErrorKey(errorMessage(error));
    } finally {
      setIsDownloading(false);
    }
  };

  const updatePlaceholder = (field: PlaceholderField, value: string) => {
    setPlaceholders((current) => ({ ...current, [field]: value }));
  };

  const fields: PlaceholderField[] = ['name', 'recipient', 'date', 'reference'];

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-4xl space-y-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center space-x-2 text-slate-500 transition-colors hover:text-blue-500"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          <span>{t('results.back')}</span>
        </button>
        <div className="glass flex items-center space-x-2 rounded-full px-4 py-2 font-bold">
          <span>{t('results.score')}:</span>
          <span className={data.global_risk_score > 50 ? 'text-red-500' : 'text-green-500'}>
            {new Intl.NumberFormat(i18n.language).format(data.global_risk_score)}/100
          </span>
        </div>
      </div>

      <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
        {t('results.disclaimer')}
      </p>

      <section aria-label={t('results.clauses')} className="space-y-6">
        {data.clauses.map((clause) => (
          <article
            key={clause.id}
            className={`rounded-2xl border p-6 transition-all hover:shadow-lg ${getRiskStyles(clause.risk_level)}`}
          >
            <div className="flex items-start gap-4">
              <div className="mt-1">{getRiskIcon(clause.risk_level)}</div>
              <div className="flex-1 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold uppercase tracking-wide">
                    {t(`risk.level.${clause.risk_level}`)}
                  </p>
                  <span className="text-xs">{t('results.confidence', {
                    value: new Intl.NumberFormat(i18n.language, { style: 'percent' }).format(clause.confidence),
                  })}</span>
                </div>
                <p className="text-lg font-medium leading-relaxed opacity-90">“{clause.text}”</p>
                {clause.plain_explanation && (
                  <div className="mt-4 space-y-2 rounded-xl bg-white/50 p-4 dark:bg-black/20">
                    <p className="text-sm font-semibold uppercase tracking-wider opacity-70">
                      {t('results.explanation')}
                    </p>
                    <p>{clause.plain_explanation}</p>
                  </div>
                )}
                {clause.why_risky && <p><strong>{t('results.why_risky')}:</strong> {clause.why_risky}</p>}
                {clause.legal_basis.length > 0 && (
                  <div>
                    <h3 className="font-semibold">{t('results.legal_basis')}</h3>
                    <ul className="list-inside list-disc">
                      {clause.legal_basis.map((basis) => (
                        <li key={`${clause.id}-${basis.reference}`}>
                          <strong>{basis.reference}:</strong> {basis.summary}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {clause.suggested_change && (
                  <p><strong>{t('results.suggested_change')}:</strong> {clause.suggested_change}</p>
                )}
              </div>
            </div>
          </article>
        ))}
      </section>

      {flaggedClauses.length > 0 && !letterContent && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !token}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-4 text-lg font-bold text-white shadow-xl shadow-blue-500/30 transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGenerating
              ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
              : <FileDown aria-hidden="true" className="h-5 w-5" />}
            <span>{isGenerating ? t('letter.generating') : t('letter.generate_button')}</span>
          </button>
        </div>
      )}

      {flaggedClauses.length === 0 && (
        <p className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-900 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-100">
          {t('letter.no_flagged_clauses')}
        </p>
      )}

      {letterContent && (
        <section aria-labelledby="objection-letter-heading" className="space-y-5 rounded-2xl border border-slate-200 p-6 dark:border-slate-700">
          <div>
            <h2 id="objection-letter-heading" className="text-2xl font-bold">
              {t('letter.preview_title')}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {t('letter.edit_hint')}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <label key={field} className="space-y-1 text-sm font-medium">
                <span>{t(`letter.field.${field}`)}</span>
                <input
                  type="text"
                  value={placeholders[field]}
                  onChange={(event) => updatePlaceholder(field, event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                />
              </label>
            ))}
          </div>

          <label htmlFor="objection-letter-content" className="sr-only">{t('letter.content_label')}</label>
          <textarea
            id="objection-letter-content"
            value={preview}
            onChange={(event) => {
              setLetterContent(event.target.value);
              setPlaceholders(EMPTY_PLACEHOLDERS);
            }}
            rows={14}
            maxLength={5000}
            className="w-full rounded-xl border border-slate-300 bg-white p-4 font-mono text-sm leading-relaxed text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isDownloading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 font-semibold hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              {isSaving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}
              {t(isSaving ? 'letter.saving' : 'letter.save')}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              <Copy aria-hidden="true" className="h-4 w-4" />
              {t('letter.copy')}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading || isSaving || !token}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isDownloading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Download aria-hidden="true" className="h-4 w-4" />}
              {t(isDownloading ? 'letter.downloading' : 'letter.download_pdf')}
            </button>
          </div>
        </section>
      )}

      {(errorKey || statusKey) && (
        <p
          role={errorKey ? 'alert' : 'status'}
          aria-live={errorKey ? 'assertive' : 'polite'}
          className={errorKey ? 'text-sm font-medium text-red-600' : 'text-sm font-medium text-green-700 dark:text-green-300'}
        >
          {t(errorKey || statusKey || '')}
        </p>
      )}
    </motion.div>
  );
}
