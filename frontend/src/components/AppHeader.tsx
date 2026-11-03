import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Globe, Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../context/AuthContext';

function titleKey(pathname: string): string {
  if (pathname.startsWith('/history')) return 'nav.history';
  if (pathname.startsWith('/settings')) return 'nav.settings';
  if (pathname.startsWith('/results')) return 'results.title';
  return 'nav.home';
}

export function AppHeader() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const location = useLocation();

  const toggleLanguage = () => {
    const newLang = i18n.language.startsWith('en') ? 'es' : 'en';
    void i18n.changeLanguage(newLang);
    localStorage.setItem('lang', newLang);
  };

  return (
    <header className="sticky top-0 z-40 -mx-4 border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 md:top-4 md:rounded-[20px] md:border md:bg-[var(--color-card)] md:shadow-[var(--shadow-floating)]">
      <div className="flex items-center justify-between gap-3">
        <h1 className="truncate text-[17px] font-bold tracking-tight">{t(titleKey(location.pathname))}</h1>
        <div className="flex items-center gap-1.5">
          <button
            id="navbar-lang-toggle"
            type="button"
            onClick={toggleLanguage}
            aria-label="Change language"
            className="flex items-center gap-1.5 rounded-[12px] px-3 py-2 text-[13px] font-semibold text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          >
            <Globe className="h-4 w-4" />
            <span className="uppercase">{i18n.language.substring(0, 2)}</span>
          </button>
          <button
            id="navbar-theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="rounded-[12px] p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          >
            {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>
          {user && (
            <span
              aria-hidden="true"
              className="ml-1 hidden h-8 w-8 items-center justify-center rounded-full bg-[var(--color-action)] text-[12px] font-bold text-white sm:flex md:hidden"
            >
              {user.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
