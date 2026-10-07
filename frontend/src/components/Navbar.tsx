import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';
import { Sun, Moon, Globe, Menu, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

export function Navbar() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  const toggleLanguage = () => {
    const newLang = i18n.language.startsWith('en') ? 'es' : 'en';
    i18n.changeLanguage(newLang);
    localStorage.setItem('cc_locale', newLang);
  };

  return (
    <motion.nav 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-50 w-full glass border-b border-card-border"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="h-8 w-8 text-blue-500" />
            <span className="font-bold text-xl tracking-tight">ContratoClaro</span>
          </div>

          <div className="hidden md:flex items-center space-x-4">
            <button 
              onClick={toggleLanguage}
              className="flex items-center space-x-1 px-3 py-2 rounded-md hover:bg-card/50 transition-colors"
            >
              <Globe className="h-4 w-4" />
              <span className="text-sm font-medium uppercase">{i18n.language.substring(0, 2)}</span>
            </button>

            <button 
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-card/50 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5 text-yellow-400" /> : <Moon className="h-5 w-5 text-slate-700" />}
            </button>

            <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-lg shadow-blue-500/20">
              {t('auth.login', 'Log In')}
            </button>
          </div>

          <div className="md:hidden flex items-center">
            <button className="p-2">
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>
    </motion.nav>
  );
}
