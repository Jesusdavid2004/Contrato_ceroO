import { useTranslation } from 'react-i18next';
import { Panel } from '../components/ui/Panel';
import coverage from '../data/legal-coverage.json';

export function Coverage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">{t('coverage.title')}</h1>
        <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">{t('coverage.subtitle')}</p>
      </div>
      <Panel>
        <p className="text-[14px]">
          {t('coverage.total', { count: coverage.total, jurisdiction: coverage.jurisdiction })}
        </p>
        <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
          {t('coverage.generated_at', { date: coverage.generatedAt })}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="text-[var(--color-text-muted)]">
                <th className="py-2 pr-4 font-bold">{t('coverage.col_file')}</th>
                <th className="py-2 pr-4 font-bold">{t('coverage.col_tema')}</th>
                <th className="py-2 pr-4 font-bold">{t('coverage.col_count')}</th>
                <th className="py-2 pr-4 font-bold">{t('coverage.col_verified')}</th>
                <th className="py-2 font-bold">{t('coverage.col_validity')}</th>
              </tr>
            </thead>
            <tbody>
              {coverage.files.map((file) => (
                <tr key={file.file} className="border-t border-[var(--color-border)]">
                  <td className="py-2 pr-4 font-mono">{file.file}</td>
                  <td className="py-2 pr-4">{file.tema}</td>
                  <td className="py-2 pr-4">{file.count}</td>
                  <td className="py-2 pr-4">{file.minFuenteVerificadaEn}</td>
                  <td className="py-2">
                    {file.vigenciaDesdeMin} → {file.vigenciaDesdeMax}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-[var(--color-text-muted)]">
          {t('coverage.note')}
        </p>
      </Panel>
    </div>
  );
}
