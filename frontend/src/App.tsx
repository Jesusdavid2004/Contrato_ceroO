import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

export default function App() {
  const { t, i18n } = useTranslation();
  
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('cc_theme');
    if (savedTheme) return savedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cc_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('cc_locale', lng);
  };

  return (
    <Router>
      <div className="min-h-screen bg-background text-text transition-colors duration-300">
        <nav className="p-4 shadow flex justify-between items-center border-b border-gray-200 dark:border-gray-800">
          <Link to="/" className="text-xl font-bold text-blue-600 dark:text-blue-400">ContratoClaro</Link>
          <div className="flex space-x-4 items-center">
            <Link to="/login" className="hover:text-blue-600 dark:hover:text-blue-400">{t('nav.login')}</Link>
            <Link to="/dashboard" className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">{t('nav.dashboard')}</Link>
            <div className="border-l border-gray-300 dark:border-gray-700 h-6 mx-2"></div>
            <button onClick={() => changeLanguage('en')} className={`text-sm ${i18n.language === 'en' ? 'font-bold underline' : ''}`}>EN</button>
            <button onClick={() => changeLanguage('es')} className={`text-sm ${i18n.language === 'es' ? 'font-bold underline' : ''}`}>ES</button>
            <button onClick={toggleTheme} className="ml-2 p-2 bg-gray-200 dark:bg-gray-700 rounded-full text-sm">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </nav>
        <main className="p-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
