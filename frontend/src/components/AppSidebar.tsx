import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, History, Settings, ShieldCheck, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const LINKS = [
  { path: '/', labelKey: 'nav.home', icon: Home, end: true },
  { path: '/history', labelKey: 'nav.history', icon: History, end: false },
  { path: '/settings', labelKey: 'nav.settings', icon: Settings, end: false },
];

function isActive(pathname: string, link: (typeof LINKS)[number]) {
  return link.end ? pathname === '/' : pathname.startsWith(link.path);
}

export function AppSidebar() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* Desktop sidebar: full height, flush, macOS style */}
      <aside className="sticky top-0 hidden h-svh w-[260px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-6 md:flex">
        <Link to="/" className="flex items-center gap-2.5 rounded-xl px-2 py-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[var(--color-action)]">
            <ShieldCheck className="h-5 w-5 text-white" />
          </span>
          <span className="text-[16px] font-bold tracking-tight">ContratoClaro</span>
        </Link>

        <nav aria-label="Primary" className="mt-8 flex flex-col gap-1">
          {LINKS.map(({ path, labelKey, icon: Icon, end }) => {
            const active = isActive(location.pathname, { path, end } as (typeof LINKS)[number]);
            return (
              <Link
                key={path}
                to={path}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-[12px] px-3.5 py-2.5 text-[14px] font-semibold transition-colors ${
                  active
                    ? 'bg-[var(--color-surface-2)] text-[var(--color-text)]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]'
                }`}
              >
                <Icon
                  className={`h-[18px] w-[18px] ${active ? 'text-[var(--color-action-text)]' : ''}`}
                />
                {t(labelKey, labelKey)}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          {user && (
            <div className="flex items-center gap-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface-tertiary)] p-3">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-action)] text-[13px] font-bold text-white"
              >
                {user.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{user.name}</span>
              <button
                id="navbar-logout"
                type="button"
                onClick={handleLogout}
                aria-label={t('auth.logout', 'Log out')}
                title={t('auth.logout', 'Log out')}
                className="rounded-[10px] p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-3 bottom-3 z-50 flex items-center justify-around rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 shadow-[var(--shadow-popover)] md:hidden"
      >
        {LINKS.map(({ path, labelKey, icon: Icon, end }) => {
          const active = isActive(location.pathname, { path, end } as (typeof LINKS)[number]);
          return (
            <Link
              key={path}
              to={path}
              aria-current={active ? 'page' : undefined}
              aria-label={t(labelKey, labelKey)}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-[16px] py-2 text-[11px] font-semibold transition-colors ${
                active ? 'text-[var(--color-action-text)]' : 'text-[var(--color-text-muted)]'
              }`}
            >
              <Icon className="h-5 w-5" />
              {t(labelKey, labelKey)}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
