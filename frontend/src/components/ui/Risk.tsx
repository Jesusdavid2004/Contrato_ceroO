import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type RiskLevel = 'low' | 'medium' | 'high';

const DOT: Record<RiskLevel, string> = {
  high: 'bg-[var(--color-risk-high-dot)]',
  medium: 'bg-[var(--color-risk-medium-dot)]',
  low: 'bg-[var(--color-risk-low-dot)]',
};

const CHIP: Record<RiskLevel, string> = {
  high: 'bg-[var(--color-risk-high-bg)] text-[var(--color-risk-high-text)]',
  medium: 'bg-[var(--color-risk-medium-bg)] text-[var(--color-risk-medium-text)]',
  low: 'bg-[var(--color-risk-low-bg)] text-[var(--color-risk-low-text)]',
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${CHIP[level]}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[level]}`} />
      {t(`risk.level.${level}`)}
    </span>
  );
}

export function RiskIcon({ level, className = 'h-5 w-5' }: { level: RiskLevel; className?: string }) {
  if (level === 'high') return <AlertTriangle aria-hidden="true" className={className} />;
  if (level === 'medium') return <Info aria-hidden="true" className={className} />;
  return <CheckCircle2 aria-hidden="true" className={className} />;
}

export function RiskScore({ score, size = 64 }: { score: number; size?: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, score)) / 100) * circumference;
  const color =
    score >= 60 ? 'var(--color-risk-high-dot)' : score >= 30 ? 'var(--color-risk-medium-dot)' : 'var(--color-risk-low-dot)';
  return (
    <svg role="img" aria-label={`${score}%`} width={size} height={size} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r={radius} fill="none" stroke="var(--color-border)" strokeWidth="7" />
      <circle
        cx="32"
        cy="32"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--color-text)">
        {score}
      </text>
    </svg>
  );
}
