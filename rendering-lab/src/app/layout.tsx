import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'ContratoClaro — Rendering Lab',
  description:
    'Interactive laboratory demonstrating all five Next.js 15 rendering patterns: CSR, SSR, SSG, ISR, and Streaming SSR with React Server Components.',
  keywords: ['Next.js', 'rendering patterns', 'SSR', 'SSG', 'ISR', 'CSR', 'Streaming'],
};

const NAV_LINKS = [
  { href: '/',         label: 'Home',          badge: '',       color: '' },
  { href: '/csr',      label: 'CSR Dashboard', badge: 'CSR',    color: 'badge-csr' },
  { href: '/ssr',      label: 'Jurisprudencia',badge: 'SSR',    color: 'badge-ssr' },
  { href: '/ssg',      label: 'Guías Legales', badge: 'SSG',    color: 'badge-ssg' },
  { href: '/isr',      label: 'Glosario',      badge: 'ISR',    color: 'badge-isr' },
  { href: '/streaming',label: 'Diagnóstico',   badge: 'Stream', color: 'badge-stream' },
  { href: '/dashboard',label: 'Performance',   badge: '📊',     color: '' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <nav className="glass sticky top-0 z-50 border-b border-white/5">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
            <Link href="/" className="font-bold text-lg gradient-text shrink-0">
              ContratoClaro Lab
            </Link>
            <div className="flex flex-wrap gap-2">
              {NAV_LINKS.slice(1).map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
                >
                  {l.badge && <span className={`badge ${l.color}`}>{l.badge}</span>}
                  <span>{l.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
        <footer className="border-t border-white/5 mt-16 py-8 text-center text-sm text-slate-500">
          ContratoClaro Rendering Lab · Next.js 15 App Router · TypeScript · Tailwind CSS
        </footer>
      </body>
    </html>
  );
}
