import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export function Privacy() {
  const { t } = useTranslation();
  const sections = [
    { title: t('privacy.data_title'), body: t('privacy.data_body') },
    { title: t('privacy.ai_title'), body: t('privacy.ai_body') },
    { title: t('privacy.rights_title'), body: t('privacy.rights_body') },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mx-auto w-full max-w-2xl space-y-5"
    >
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-action)]"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        ContratoClaro
      </Link>
      <div className="floating-panel">
        <span className="inline-flex rounded-[13px] bg-[var(--color-action-soft)] p-2.5">
          <ShieldCheck aria-hidden="true" className="h-5 w-5 text-[var(--color-action)]" />
        </span>
        <h1 className="mt-3 text-[24px] font-bold tracking-tight">{t('privacy.title')}</h1>
        <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">{t('privacy.intro')}</p>
        <div className="mt-5 space-y-4">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="text-[15px] font-bold">{s.title}</h2>
              <p className="mt-1 text-[14px] leading-relaxed text-[var(--color-text-muted)]">{s.body}</p>
            </section>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
