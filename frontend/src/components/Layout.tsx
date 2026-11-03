import { ReactNode } from 'react';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { useAuth } from '../context/AuthContext';

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (!user) {
    return (
      <div
        className="flex min-h-svh items-center justify-center px-4 py-10"
        style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
      >
        <div className="w-full max-w-md">{children}</div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-svh w-full"
      style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
    >
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
