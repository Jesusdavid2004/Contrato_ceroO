import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { TextField, PasswordField } from '../components/ui/Fields';

export function Register() {
  const { t } = useTranslation();
  const { register, isLoading, error, clearError } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await register(name, email, password);
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
        <h1 className="text-[24px] font-bold tracking-tight">{t('auth.register_title', 'Create account')}</h1>
        <p className="text-[14px] text-[var(--color-text-muted)]">
          {t('auth.register_subtitle', 'Start protecting yourself from abusive contracts')}
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
          id="register-name"
          label={t('auth.name', 'Full name')}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="John Doe"
          autoComplete="name"
        />
        <TextField
          id="register-email"
          label={t('auth.email', 'Email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@example.com"
          autoComplete="email"
        />
        <PasswordField
          id="register-password"
          label={t('auth.password', 'Password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          placeholder={t('auth.password_hint', 'min. 8 characters')}
          autoComplete="new-password"
        />
        <Button id="register-submit" type="submit" size="lg" loading={isLoading} className="w-full">
          {!isLoading && <ArrowRight className="h-4 w-4" />}
          {isLoading ? t('auth.creating', 'Creating account...') : t('auth.register_button', 'Create account')}
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-[var(--color-text-muted)]">
        {t('auth.have_account', 'Already have an account?')}{' '}
        <Link to="/login" className="font-semibold text-[var(--color-action)] hover:underline">
          {t('auth.login_link', 'Sign in')}
        </Link>
      </p>
    </motion.div>
  );
}
