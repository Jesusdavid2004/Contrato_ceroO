import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Copy, Download, FileDown, Info, Save } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  ContractApiError,
  downloadObjectionLetterPdf,
  generateObjectionLetter,
  isContractAnalysisResult,
  updateObjectionLetter,
} from '../services/contracts';
import { Button } from '../components/ui/Button';
import { Panel } from '../components/ui/Panel';
import { RiskBadge, RiskScore } from '../components/ui/Risk';
import { ClauseCard } from '../components/ClauseCard';

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

function scoreLevel(score: number): 'low' | 'medium' | 'high' {
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

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
    () =>
      (Object.entries(placeholders) as [PlaceholderField, string][]).reduce(
        (content, [field, value]) =>
          value.trim() ? content.split(localizedTokens[field]).join(value.trim()) : content,
        letterContent,
      ),
    [letterContent, localizedTokens, placeholders],
  );

  if (!isContractAnalysisResult(dataState)) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-4 text-center">
        <p className="text-[18px] font-bold text-[var(--color-risk-high-text)]">{t('results.invalid_data')}</p>
        <Button onClick={() => navigate('/')}>{t('results.try_again')}</Button>
      </div>
    );
  }

  const data = dataState;
  const flaggedClauses = data.clauses.filter((clause) => clause.risk_level !== 'low');

  const errorMessage = (error: unknown) =>
    error instanceof ContractApiError ? error.messageKey : 'errors.api_error';

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
      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-5"
    >
      <button
        type="button"
        onClick={() => navigate('/')}
        className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-action-text)]"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {t('results.back')}
      </button>

      {/* Score module */}
      <Panel className="flex flex-wrap items-center gap-5">
        <RiskScore score={data.global_risk_score} size={76} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
            {t('results.score')}
          </p>
          <p className="mt-1 text-[26px] font-bold tracking-tight">
            {new Intl.NumberFormat(i18n.language).format(data.global_risk_score)}
            <span className="text-[16px] font-semibold text-[var(--color-text-muted)]">/100</span>
          </p>
          <div className="mt-2">
            <RiskBadge level={scoreLevel(data.global_risk_score)} />
          </div>
        </div>
      </Panel>

      <p className="flex items-start gap-2 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-[13px] leading-relaxed text-[var(--color-text-muted)]">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        {t('results.disclaimer')}
      </p>

      <section aria-label={t('results.clauses')} className="grid items-start gap-4 xl:grid-cols-2">
        {data.clauses.map((clause, i) => (
          <ClauseCard key={clause.id} clause={clause} defaultOpen={i === 0} />
        ))}
      </section>

      {flaggedClauses.length > 0 && !letterContent && (
        <div className="flex justify-center pt-1">
          <Button size="lg" loading={isGenerating} disabled={!token} onClick={handleGenerate} icon={<FileDown aria-hidden="true" className="h-5 w-5" />}>
            {isGenerating ? t('letter.generating') : t('letter.generate_button')}
          </Button>
        </div>
      )}

      {flaggedClauses.length === 0 && (
        <p className="rounded-[16px] border border-[var(--color-border)] bg-[var(--color-risk-low-bg)] p-4 text-[14px] font-medium text-[var(--color-risk-low-text)]">
          {t('letter.no_flagged_clauses')}
        </p>
      )}

      {letterContent && (
        <Panel aria-labelledby="objection-letter-heading">
          <h2 id="objection-letter-heading" className="text-[19px] font-bold tracking-tight">
            {t('letter.preview_title')}
          </h2>
          <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">{t('letter.edit_hint')}</p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <label key={field} className="space-y-1 text-[13px] font-semibold">
                {t(`letter.field.${field}`)}
                <input
                  type="text"
                  value={placeholders[field]}
                  onChange={(event) => updatePlaceholder(field, event.target.value)}
                  className="w-full rounded-[13px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 font-normal text-[var(--color-text)] focus:border-[var(--color-action)] focus:outline-none"
                />
              </label>
            ))}
          </div>

          <label htmlFor="objection-letter-content" className="sr-only">
            {t('letter.content_label')}
          </label>
          <textarea
            id="objection-letter-content"
            value={preview}
            onChange={(event) => {
              setLetterContent(event.target.value);
              setPlaceholders(EMPTY_PLACEHOLDERS);
            }}
            rows={14}
            maxLength={5000}
            className="mt-3 w-full rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 font-mono text-[13px] leading-relaxed text-[var(--color-text)] focus:border-[var(--color-action)] focus:outline-none"
          />

          <div className="mt-4 flex flex-wrap gap-2.5">
            <Button variant="secondary" loading={isSaving} disabled={isDownloading} onClick={handleSave} icon={<Save aria-hidden="true" className="h-4 w-4" />}>
              {isSaving ? t('letter.saving') : t('letter.save')}
            </Button>
            <Button variant="secondary" onClick={handleCopy} icon={<Copy aria-hidden="true" className="h-4 w-4" />}>
              {t('letter.copy')}
            </Button>
            <Button loading={isDownloading} disabled={isSaving || !token} onClick={handleDownload} icon={<Download aria-hidden="true" className="h-4 w-4" />}>
              {isDownloading ? t('letter.downloading') : t('letter.download_pdf')}
            </Button>
          </div>
        </Panel>
      )}

      {(errorKey || statusKey) && (
        <p
          role={errorKey ? 'alert' : 'status'}
          aria-live={errorKey ? 'assertive' : 'polite'}
          className={`text-[13px] font-medium ${errorKey ? 'text-[var(--color-risk-high-text)]' : 'text-[var(--color-risk-low-text)]'}`}
        >
          {t(errorKey || statusKey || '')}
        </p>
      )}
    </motion.div>
  );
}
