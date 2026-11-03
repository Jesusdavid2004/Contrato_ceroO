import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileUp, Loader2 } from 'lucide-react';

const ACCEPT = '.pdf,image/png,image/jpeg,image/webp,image/tiff,image/bmp,image/gif,.tiff,.tif,.webp,.bmp';

export function FileDropzone({
  isUploading,
  stage,
  onFile,
}: {
  isUploading: boolean;
  stage?: string | null;
  onFile: (file: File) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      role="button"
      tabIndex={isUploading ? -1 : 0}
      aria-disabled={isUploading}
      aria-label={t('contract.upload_cta')}
      onClick={() => !isUploading && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !isUploading) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!isUploading) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (!isUploading && e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0]);
      }}
      className={`flex min-h-[300px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed px-8 py-16 text-center transition-all duration-200 ${
        isDragging
          ? 'border-[var(--color-action)] bg-[var(--color-action-soft)] scale-[1.01]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-action)]'
      } ${isUploading ? 'pointer-events-none opacity-75' : ''}`}
    >
      <input
        type="file"
        className="hidden"
        ref={inputRef}
        onChange={(e) => {
          if (e.target.files?.[0]) onFile(e.target.files[0]);
          e.target.value = '';
        }}
        accept={ACCEPT}
      />
      <span className="flex h-13 w-13 items-center justify-center rounded-[18px] bg-[var(--color-action-soft)] p-3.5">
        {isUploading ? (
          <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-[var(--color-action-text)]" />
        ) : (
          <FileUp aria-hidden="true" className="h-6 w-6 text-[var(--color-action-text)]" />
        )}
      </span>
      <span className="text-[16px] font-bold">
        {isUploading ? t('contract.analyzing', 'Analyzing contract...') : t('contract.upload_cta')}
      </span>
      <span className="text-[13px] text-[var(--color-text-muted)]">
        {isUploading && stage
          ? t(`history.status.${stage}`, { defaultValue: t('contract.analyzing', 'Analyzing contract...') })
          : t('contract.upload_hint', 'PDF or Images (max 10MB)')}
      </span>
    </div>
  );
}
