import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Eye, EyeOff, ArrowRight, User } from 'lucide-react';

export function Register() {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="min-h-[85vh] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="glass rounded-3xl p-8 space-y-6">
          <div className="flex flex-col items-center space-y-2 mb-4">
            <div className="p-3 bg-indigo-100 dark:bg-indigo-900/40 rounded-2xl">
              <User className="h-10 w-10 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold">{t('auth.register_title', 'Create account')}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
              {t('auth.register_subtitle', 'Start protecting yourself from abusive contracts')}
            </p>
          </div>

          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('auth.name', 'Full name')}
              </label>
              <input
                id="register-name"
                type="text"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="John Doe"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('auth.email', 'Email')}
              </label>
              <input
                id="register-email"
                type="email"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('auth.password', 'Password')}
              </label>
              <div className="relative">
                <input
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all pr-12"
                  placeholder="min. 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              id="register-submit"
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-semibold transition-all shadow-lg shadow-indigo-500/25 hover:scale-[1.02] flex items-center justify-center space-x-2"
            >
              <span>{t('auth.register_button', 'Create account')}</span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            {t('auth.have_account', 'Already have an account?')}{' '}
            <Link to="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
              {t('auth.login_link', 'Sign in')}
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
