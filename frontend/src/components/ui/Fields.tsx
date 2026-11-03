import { InputHTMLAttributes, ReactNode, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
}

export function TextField({ label, error, id, className = '', ...rest }: TextFieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-[var(--color-text)]">
        {label}
      </label>
      <input
        id={id}
        className={`w-full rounded-[13px] border bg-[var(--color-surface)] px-4 py-3 text-[15px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] transition-colors focus:border-[var(--color-action)] focus:outline-none ${
          error ? 'border-red-400' : 'border-[var(--color-border)]'
        } ${className}`}
        {...rest}
      />
      {error && (
        <p role="alert" className="text-[13px] font-medium text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}

export function PasswordField({ label, error, id, ...rest }: TextFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-[var(--color-text)]">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          aria-label={label}
          className={`w-full rounded-[13px] border bg-[var(--color-surface)] px-4 py-3 pr-12 text-[15px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] transition-colors focus:border-[var(--color-action)] focus:outline-none ${
            error ? 'border-red-400' : 'border-[var(--color-border)]'
          }`}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
        >
          {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[13px] font-medium text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="floating-card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="mb-1 rounded-2xl bg-[var(--color-surface-2)] p-3 text-[var(--color-text-muted)]">
        {icon}
      </div>
      <p className="text-[15px] font-semibold">{title}</p>
      {hint && <p className="max-w-sm text-sm text-[var(--color-text-muted)]">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
