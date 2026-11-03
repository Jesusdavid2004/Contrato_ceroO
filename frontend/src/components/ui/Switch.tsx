/**
 * Accessible switch control (44-48px x 24-26px, 18-20px knob, 3px padding).
 * No external dependency: native button with role="switch".
 */
export function Switch({
  on,
  onToggle,
  id,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  id: string;
  label: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors duration-200 ${
        on ? 'bg-[var(--color-action)]' : 'bg-[var(--color-border)]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-[3px] left-[3px] block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
