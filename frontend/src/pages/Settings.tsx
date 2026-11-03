import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Globe, Moon, ShieldAlert, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../context/AuthContext';
import { deleteAccount } from '../services/contracts';
import { SectionHeader } from '../components/ui/Panel';
import { Switch } from '../components/ui/Switch';
import { Button } from '../components/ui/Button';

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
            danger ? 'bg-[var(--color-risk-high-bg)] text-[var(--color-risk-high-text)]' : 'bg-[var(--color-surface-2)] text-[var(--color-action-text)]'
          }`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className={`truncate text-[14px] font-semibold ${danger ? 'text-[var(--color-risk-high-text)]' : ''}`}>{title}</p>
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
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const isDark = theme === 'dark';
  const isSpanish = i18n.language.startsWith('es');

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [password, setPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const toggleLanguage = () => {
    const newLang = isSpanish ? 'en' : 'es';
    void i18n.changeLanguage(newLang);
    localStorage.setItem('lang', newLang);
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      // Password re-entry re-authenticates before destroying everything.
      const freshToken = await login(user.email, password);
      await deleteAccount(freshToken);
      // React Router commits navigations in a transition while auth updates
      // are urgent: clearing the session in the same tick would render
      // ProtectedRoute at the stale location and bounce to /login. Wait for
      // /register to paint first, then clear the session.
      navigate('/register', { replace: true });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      logout();
    } catch {
      setDeleteError(t('settings.delete_failed'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader title={t('settings.title', 'Settings')} subtitle={t('settings.subtitle', 'Manage your preferences')} />

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
        transition={{ duration: 0.3, delay: 0.12 }}
        aria-label={t('settings.danger_zone', 'Danger zone')}
        className="floating-panel border-[var(--color-border)] p-1! dark:border-[var(--color-border)]"
      >
        <h2 className="px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-risk-high-text)]">
          {t('settings.danger_zone', 'Danger zone')}
        </h2>
        {!confirmingDelete ? (
          <Row
              icon={<ShieldAlert className="h-5 w-5" />}
              title={t('settings.delete_account', 'Delete account')}
              desc={t('settings.delete_account_desc', 'Permanently remove all your data')}
              danger
              control={
                <button
                  id="settings-delete-account"
                  type="button"
                  onClick={() => {
                    setConfirmingDelete(true);
                    setDeleteError(null);
                    setPassword('');
                  }}
                  className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-risk-high-bg)] px-5 text-[13px] font-semibold text-[var(--color-risk-high-text)] transition-colors hover:brightness-95 dark:hover:brightness-125"
                >
                  {t('settings.delete_account', 'Delete account')}
                </button>
              }
            />
        ) : (
          <form onSubmit={handleDeleteAccount} className="space-y-3 px-5 py-4">
            <p className="text-[13px] text-[var(--color-text-muted)]">{t('settings.delete_prompt')}</p>
            <label className="space-y-1 text-[13px] font-semibold">
              {t('auth.password', 'Password')}
              <input
                id="settings-delete-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-[13px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 font-normal focus:border-[var(--color-action)] focus:outline-none"
              />
            </label>
        {deleteError && (
          <p role="alert" className="text-[13px] font-medium text-[var(--color-risk-high-text)]">
                {deleteError}
              </p>
            )}
            <div className="flex flex-wrap gap-2.5">
              <Button type="submit" variant="danger" loading={isDeleting} className="h-11! px-5">
                {t('settings.delete_confirm', 'Delete my account')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-11! px-5"
                onClick={() => {
                  setConfirmingDelete(false);
                  setPassword('');
                  setDeleteError(null);
                }}
              >
                {t('settings.delete_cancel', 'Cancel')}
              </Button>
            </div>
          </form>
        )}
      </motion.section>
    </div>
  );
}
