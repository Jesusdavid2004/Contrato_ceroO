import { ReactNode } from 'react';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { useAuth } from '../context/AuthContext';

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (!user) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4 py-10"
        style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
      >
        <div className="w-full max-w-md">{children}</div>
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex min-h-screen w-full max-w-[1200px] gap-5 px-4 py-4 sm:px-6"
      style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
    >
      <AppSidebar />
      <div className="min-w-0 flex-1 pb-24 md:pb-10">
        <AppHeader />
        <main className="mx-auto w-full max-w-[880px] px-1 pt-6 sm:px-2">{children}</main>
      </div>
    </div>
  );
}
