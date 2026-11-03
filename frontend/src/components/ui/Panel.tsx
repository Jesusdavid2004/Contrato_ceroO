import { ReactNode } from 'react';

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`floating-panel p-6 sm:p-8 ${className}`}>{children}</section>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`floating-card p-5 ${className}`}>{children}</div>;
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight sm:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-[var(--color-text-muted)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
