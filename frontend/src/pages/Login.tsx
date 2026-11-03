import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { TextField, PasswordField } from '../components/ui/Fields';

export function Login() {
  const { t } = useTranslation();
  const { login, isLoading, error, clearError } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch {
      // error is set in context
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="floating-panel"
    >
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-[17px] bg-[var(--color-action-soft)]">
          <ShieldCheck className="h-6 w-6 text-[var(--color-action)]" />
        </span>
        <h1 className="text-[24px] font-bold tracking-tight">{t('auth.login_title', 'Welcome back')}</h1>
        <p className="text-[14px] text-[var(--color-text-muted)]">
          {t('auth.login_subtitle', 'Sign in to analyze your contracts')}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-5 flex items-center gap-2 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <TextField
          id="login-email"
          label={t('auth.email', 'Email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@example.com"
          autoComplete="email"
        />
        <PasswordField
          id="login-password"
          label={t('auth.password', 'Password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="••••••••"
          autoComplete="current-password"
        />
        <Button id="login-submit" type="submit" size="lg" loading={isLoading} className="w-full">
          {!isLoading && <ArrowRight className="h-4 w-4" />}
          {isLoading ? t('auth.signing_in', 'Signing in...') : t('auth.login', 'Log In')}
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-[var(--color-text-muted)]">
        {t('auth.no_account', "Don't have an account?")}{' '}
        <Link to="/register" className="font-semibold text-[var(--color-action)] hover:underline">
          {t('auth.register_link', 'Sign up free')}
        </Link>
      </p>
    </motion.div>
  );
}
