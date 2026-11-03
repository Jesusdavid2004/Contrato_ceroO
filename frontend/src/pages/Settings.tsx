import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Bell, Globe, Moon, ShieldAlert, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { SectionHeader } from '../components/ui/Panel';
import { Switch } from '../components/ui/Switch';

function Row({
  icon,
  title,
  desc,
  control,
  danger = false,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  control: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="flex min-h-[72px] w-full items-center justify-between gap-5 px-5 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] ${
            danger ? 'bg-red-500/10 text-red-500' : 'bg-[var(--color-surface-2)] text-[var(--color-action)]'
          }`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className={`truncate text-[14px] font-semibold ${danger ? 'text-red-500' : ''}`}>{title}</p>
          <p className="truncate text-[13px] text-[var(--color-text-muted)]">{desc}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-center">{control}</div>
    </div>
  );
}

export function Settings() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const isSpanish = i18n.language.startsWith('es');

  const toggleLanguage = () => {
    const newLang = isSpanish ? 'en' : 'es';
    void i18n.changeLanguage(newLang);
    localStorage.setItem('lang', newLang);
  };

  return (
    <div className="space-y-5">
      <SectionHeader title={t('settings.title', 'Settings')} subtitle={t('settings.subtitle', 'Manage your preferences')} />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          aria-label={t('settings.appearance', 'Appearance')}
          className="floating-panel p-1!"
        >
          <h2 className="px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
            {t('settings.appearance', 'Appearance')}
          </h2>
          <Row
            icon={isDark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            title={t('settings.theme', 'Theme')}
            desc={isDark ? t('settings.dark', 'Dark mode') : t('settings.light', 'Light mode')}
            control={<Switch id="settings-theme-toggle" label={t('settings.theme', 'Theme')} on={isDark} onToggle={toggleTheme} />}
          />
          <div className="mx-5 border-t border-[var(--color-border)]" />
          <Row
            icon={<Globe className="h-5 w-5" />}
            title={t('settings.language', 'Language')}
            desc={isSpanish ? 'Español' : 'English'}
            control={
              <button
                id="settings-lang-toggle"
                type="button"
                onClick={toggleLanguage}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-action)] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--color-action-hover)]"
              >
                {isSpanish ? 'EN' : 'ES'}
              </button>
            }
          />
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.06 }}
          aria-label={t('settings.notifications', 'Notifications')}
          className="floating-panel p-1!"
        >
          <h2 className="px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
            {t('settings.notifications', 'Notifications')}
          </h2>
          <Row
            icon={<Bell className="h-5 w-5" />}
            title={t('settings.analysis_alerts', 'Analysis alerts')}
            desc={t('settings.analysis_alerts_desc', 'Get notified when an analysis completes')}
            control={<Switch id="settings-notifications-toggle" label={t('settings.analysis_alerts', 'Analysis alerts')} on onToggle={() => {}} />}
          />
        </motion.section>
      </div>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.12 }}
        aria-label={t('settings.danger_zone', 'Danger zone')}
        className="floating-panel border-red-200! p-1! dark:border-red-500/20!"
      >
        <h2 className="px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-red-500">
          {t('settings.danger_zone', 'Danger zone')}
        </h2>
        <Row
          icon={<ShieldAlert className="h-5 w-5" />}
          title={t('settings.delete_account', 'Delete account')}
          desc={t('settings.delete_account_desc', 'Permanently remove all your data')}
          danger
          control={
            <span className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-500/10 px-5 text-[13px] font-semibold text-red-500 dark:border-red-500/20">
              {t('settings.delete_account', 'Delete account')}
            </span>
          }
        />
      </motion.section>
    </div>
  );
}
