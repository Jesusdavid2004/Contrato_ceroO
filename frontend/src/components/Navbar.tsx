import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../context/AuthContext';
import { Sun, Moon, Globe, ShieldCheck, History, Settings, LogIn, LogOut, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const NAV_LINKS = [
  { path: '/history', labelKey: 'nav.history', icon: History },
  { path: '/settings', labelKey: 'nav.settings', icon: Settings },
];

export function Navbar() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const toggleLanguage = () => {
    const newLang = i18n.language.startsWith('en') ? 'es' : 'en';
    i18n.changeLanguage(newLang);
    localStorage.setItem('lang', newLang);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-50 w-full glass border-b border-white/10 dark:border-white/5"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">

          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2 group">
            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-xl group-hover:scale-110 transition-transform">
              <ShieldCheck className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="font-bold text-lg tracking-tight">ContratoClaro</span>
          </Link>

          {/* Nav links — only when authenticated */}
          {user && (
            <div className="hidden md:flex items-center space-x-1">
              {NAV_LINKS.map(({ path, labelKey, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all
                    ${location.pathname === path
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{t(labelKey, labelKey)}</span>
                </Link>
              ))}
            </div>
          )}

          {/* Right controls */}
          <div className="flex items-center space-x-2">
            <button
              id="navbar-lang-toggle"
              onClick={toggleLanguage}
              className="flex items-center space-x-1 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium"
            >
              <Globe className="h-4 w-4" />
              <span className="uppercase">{i18n.language.substring(0, 2)}</span>
            </button>

            <button
              id="navbar-theme-toggle"
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark'
                ? <Sun className="h-5 w-5 text-yellow-400" />
                : <Moon className="h-5 w-5 text-slate-600" />
              }
            </button>

            {user ? (
              <div className="flex items-center space-x-2">
                <div className="hidden md:flex items-center space-x-2 glass px-3 py-1.5 rounded-full">
                  <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                    <User className="h-3 w-3 text-white" />
                  </div>
                  <span className="text-sm font-medium">{user.name.split(' ')[0]}</span>
                </div>
                <button
                  id="navbar-logout"
                  onClick={handleLogout}
                  className="flex items-center space-x-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-all"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden md:inline">{t('auth.logout', 'Log out')}</span>
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-blue-500/20 hover:scale-105"
              >
                <LogIn className="h-4 w-4" />
                <span>{t('auth.login', 'Log In')}</span>
              </Link>
            )}
          </div>

        </div>
      </div>
    </motion.nav>
  );
}
