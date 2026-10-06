import { useTranslation } from 'react-i18next';

export default function Dashboard() {
  const { t } = useTranslation();
  return (
    <div>
      <h2 className="text-3xl font-bold mb-6">{t('nav.dashboard')}</h2>
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-12 text-center hover:bg-gray-50 dark:hover:bg-gray-700 transition cursor-pointer mb-8">
          <p className="text-gray-500 dark:text-gray-400 font-medium">{t('contract.upload_cta')} (PDF / Image, Max. 10MB)</p>
          <button className="mt-4 bg-gray-800 dark:bg-gray-200 text-white dark:text-black px-4 py-2 rounded">Browse Files</button>
        </div>
        
        <h3 className="text-xl font-semibold mb-4">Recent History</h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm">No contracts analyzed yet.</p>
      </div>
    </div>
  );
}
