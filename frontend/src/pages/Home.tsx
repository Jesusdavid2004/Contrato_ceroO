import { useTranslation } from 'react-i18next';

export default function Home() {
  const { t } = useTranslation();
  return (
    <div className="text-center mt-20">
      <h1 className="text-4xl font-extrabold mb-4 text-blue-600 dark:text-blue-400">{t('home.title')}</h1>
      <p className="text-lg opacity-80 mb-8 max-w-2xl mx-auto">{t('home.subtitle')}</p>
      <button className="bg-blue-600 text-white px-6 py-3 rounded-lg text-lg font-semibold shadow hover:bg-blue-700 transition">
        {t('contract.upload_cta')}
      </button>
      <div className="mt-12 flex justify-center gap-4">
        <div className="p-4 bg-risk-high rounded text-text font-medium border border-red-200 dark:border-red-900 shadow-sm">{t('risk.level.high')} Preview</div>
        <div className="p-4 bg-risk-medium rounded text-text font-medium border border-yellow-200 dark:border-yellow-900 shadow-sm">{t('risk.level.medium')} Preview</div>
        <div className="p-4 bg-risk-low rounded text-text font-medium border border-green-200 dark:border-green-900 shadow-sm">{t('risk.level.low')} Preview</div>
      </div>
    </div>
  );
}
