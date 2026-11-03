import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { FileSearch, Sparkles, PenLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ContractApiError, uploadAndAnalyzeContract } from '../services/contracts';
import { preHashFile } from '../lib/fileHash';
import { FileDropzone } from '../components/FileDropzone';

const MODULES = [
  { icon: FileSearch, titleKey: 'features.scan.title', descKey: 'features.scan.desc' },
  { icon: Sparkles, titleKey: 'features.analyze.title', descKey: 'features.analyze.desc' },
  { icon: PenLine, titleKey: 'features.protect.title', descKey: 'features.protect.desc' },
];

export function Home() {
  const { t, i18n } = useTranslation();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    try {
      if (!token) throw new ContractApiError('errors.unauthorized');
      // Non-blocking pre-hash in a Web Worker: keeps the main thread free (INP)
      // and never delays the upload; result is only used for client-side dedupe hints.
      void preHashFile(file);
      const data = await uploadAndAnalyzeContract(file, i18n.language.substring(0, 2), token);
      navigate('/results', { state: { contractData: data } });
    } catch (err: unknown) {
      const messageKey = err instanceof ContractApiError ? err.messageKey : 'errors.api_error';
      setUploadError(t(messageKey, { defaultValue: t('errors.analysis_failed') }));
    } finally {
      setIsUploading(false);
    }
  };

  const firstName = user?.name.split(' ')[0];

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {firstName && (
          <p className="text-[14px] font-medium text-[var(--color-text-muted)]">
            {t('home.greeting', { name: firstName, defaultValue: `Hello, ${firstName}` })}
          </p>
        )}
        <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-tight sm:text-[36px]">
          {t('home.headline', 'Analyze your contracts')}
        </h1>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[var(--color-text-muted)]">
          {t('home.subtitle', 'Identify risks, understand your clauses and make informed decisions.')}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        className="floating-panel !p-4 sm:!p-5"
      >
        <FileDropzone isUploading={isUploading} onFile={(f) => void uploadFile(f)} />
        {uploadError && (
          <p role="alert" className="px-2 pb-1 pt-3 text-[13px] font-medium text-red-500">
            {uploadError}
          </p>
        )}
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {MODULES.map(({ icon: Icon, titleKey, descKey }, i) => (
          <motion.div
            key={titleKey}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.12 + i * 0.06 }}
            className="floating-card"
          >
            <span className="inline-flex rounded-[13px] bg-[var(--color-action-soft)] p-2.5">
              <Icon aria-hidden="true" className="h-5 w-5 text-[var(--color-action)]" />
            </span>
            <h2 className="mt-3 text-[15px] font-bold">{t(titleKey)}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-text-muted)]">{t(descKey)}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
