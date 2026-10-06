import { useTranslation } from 'react-i18next';

export default function Login() {
  const { t } = useTranslation();
  return (
    <div className="max-w-md mx-auto mt-20 p-6 bg-white dark:bg-gray-800 shadow-xl rounded-lg border border-gray-100 dark:border-gray-700">
      <h2 className="text-2xl font-bold text-center mb-6">{t('nav.login')}</h2>
      <form className="flex flex-col space-y-4">
        <input type="email" placeholder="Email" className="p-3 border dark:border-gray-600 dark:bg-gray-700 rounded focus:ring-2 focus:ring-blue-600 outline-none" />
        <input type="password" placeholder="Password" className="p-3 border dark:border-gray-600 dark:bg-gray-700 rounded focus:ring-2 focus:ring-blue-600 outline-none" />
        <button type="button" className="bg-blue-600 text-white p-3 rounded font-bold hover:bg-blue-700">Login</button>
      </form>
    </div>
  );
}
