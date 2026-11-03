import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { RiskBadge, RiskIcon, type RiskLevel } from './ui/Risk';
import type { ContractClauseResponse } from '../services/contracts';

function riskLevelOf(level: string): RiskLevel {
  return level === 'high' || level === 'medium' ? level : 'low';
}

export function ClauseCard({ clause, defaultOpen = false }: { clause: ContractClauseResponse; defaultOpen?: boolean }) {
  const { t, i18n } = useTranslation();
  const shouldReduceMotion = useReducedMotion();
  const [open, setOpen] = useState(defaultOpen);
  const level = riskLevelOf(clause.risk_level);

  return (
    <article className="floating-card p-0!">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-5 text-left"
      >
        <span className="mt-0.5 shrink-0 text-[var(--color-text-muted)]">
          <RiskIcon level={level} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <RiskBadge level={level} />
            <span className="text-[12px] text-[var(--color-text-muted)]">
              {t('results.confidence', {
                value: new Intl.NumberFormat(i18n.language, { style: 'percent' }).format(clause.confidence),
              })}
            </span>
          </span>
          <span className="mt-2 line-clamp-2 block text-[14px] font-medium leading-relaxed opacity-90">
            “{clause.text || clause.original_text}”
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`mt-1 h-4 w-4 shrink-0 text-[var(--color-text-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-[var(--color-border)] p-5">
              {clause.plain_explanation && (
                <div className="rounded-[14px] bg-[var(--color-surface-2)] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider opacity-60">
                    {t('results.explanation')}
                  </p>
                  <p className="mt-1 text-[14px] leading-relaxed">{clause.plain_explanation}</p>
                </div>
              )}
              {clause.why_risky && (
                <p className="text-[14px] leading-relaxed">
                  <strong>{t('results.why_risky')}:</strong> {clause.why_risky}
                </p>
              )}
              {clause.legal_basis.length > 0 && (
                <div>
                  <h3 className="text-[13px] font-bold">{t('results.legal_basis')}</h3>
                  <ul className="mt-1 list-inside list-disc space-y-1 text-[14px]">
                    {clause.legal_basis.map((basis) => (
                      <li key={`${clause.id}-${basis.reference}`}>
                        <strong>{basis.reference}:</strong> {basis.summary}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {clause.suggested_change && (
                <p className="text-[14px] leading-relaxed">
                  <strong>{t('results.suggested_change')}:</strong> {clause.suggested_change}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}
