import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ShieldCheck, Globe, Moon, Sun, Bell, Trash2, ChevronRight } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export function Settings() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  const toggleLanguage = () => {
    const newLang = i18n.language.startsWith('en') ? 'es' : 'en';
    i18n.changeLanguage(newLang);
    localStorage.setItem('cc_locale', newLang);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold">{t('settings.title', 'Settings')}</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">{t('settings.subtitle', 'Manage your preferences')}</p>
      </motion.div>

      {/* Appearance section */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {t('settings.appearance', 'Appearance')}
        </h2>
        <div className="glass rounded-2xl overflow-hidden divide-y divide-slate-200/50 dark:divide-slate-700/50">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center space-x-3">
              {theme === 'dark' ? <Moon className="h-5 w-5 text-indigo-400" /> : <Sun className="h-5 w-5 text-yellow-500" />}
              <div>
                <p className="font-medium">{t('settings.theme', 'Theme')}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {theme === 'dark' ? t('settings.dark', 'Dark mode') : t('settings.light', 'Light mode')}
                </p>
              </div>
            </div>
            <button
              id="settings-theme-toggle"
              onClick={toggleTheme}
              className={`relative w-12 h-6 rounded-full transition-colors ${theme === 'dark' ? 'bg-blue-600' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${theme === 'dark' ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between p-4">
            <div className="flex items-center space-x-3">
              <Globe className="h-5 w-5 text-blue-500" />
              <div>
                <p className="font-medium">{t('settings.language', 'Language')}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {i18n.language.startsWith('en') ? 'English' : 'Español'}
                </p>
              </div>
            </div>
            <button
              id="settings-lang-toggle"
              onClick={toggleLanguage}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors"
            >
              {i18n.language.startsWith('en') ? 'ES' : 'EN'}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Notifications section */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          {t('settings.notifications', 'Notifications')}
        </h2>
        <div className="glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center space-x-3">
              <Bell className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="font-medium">{t('settings.analysis_alerts', 'Analysis alerts')}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.analysis_alerts_desc', 'Get notified when an analysis completes')}</p>
              </div>
            </div>
            <button className="relative w-12 h-6 rounded-full bg-blue-600">
              <span className="absolute top-1 w-4 h-4 bg-white rounded-full shadow translate-x-7" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Danger zone */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-red-500">
          {t('settings.danger_zone', 'Danger zone')}
        </h2>
        <div className="glass border border-red-200 dark:border-red-900/50 rounded-2xl overflow-hidden">
          <button className="w-full flex items-center justify-between p-4 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors group">
            <div className="flex items-center space-x-3">
              <Trash2 className="h-5 w-5 text-red-500" />
              <div className="text-left">
                <p className="font-medium text-red-600 dark:text-red-400">{t('settings.delete_account', 'Delete account')}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.delete_account_desc', 'Permanently remove all your data')}</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-red-400" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
