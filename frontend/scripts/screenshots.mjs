#!/usr/bin/env node
/**
 * Captures release screenshots with a mocked API (synthetic data only).
 * Serves the frontend with Vite, drives the main pages in light and dark
 * themes, and saves PNG files to docs/img/.
 *
 * Usage: START_DEV_SERVER=1 node scripts/screenshots.mjs [--base-url ... --out-dir ...]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RISKY_CLAUSE = {
  id: 'clause-risky',
  original_text: 'This agreement renews automatically every year unless notice is given.',
  risk_level: 'high',
  plain_explanation: 'The agreement renews automatically unless you act before the deadline.',
  confidence: 0.94,
  why_risky: 'A missed notice deadline may extend the agreement.',
  legal_basis: [],
  suggested_change: 'Request a clear reminder and a reasonable cancellation period.',
};
const SAFE_CLAUSE = {
  id: 'clause-safe',
  original_text: 'Notices will be sent to the contact details provided by each party.',
  risk_level: 'low',
  plain_explanation: 'This clause explains how the parties send notices.',
  confidence: 0.96,
  why_risky: null,
  legal_basis: [],
  suggested_change: null,
};
const LETTER = [
  'Dear [RECIPIENT],',
  '',
  'Please review the clause in [CONTRACT REFERENCE].',
  'I request clear and balanced terms.',
  'Please provide a written response.',
  'Sincerely,',
  '[YOUR NAME]',
  '[DATE]',
].join('\n');

async function mockApi(page) {
  const user = { id: 'u1', name: 'Alex Rivera', email: 'audit@example.test' };
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api\/v1\//, '/api/');
    const method = route.request().method();
    const json = (body, status = 200) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(body),
    });
    if (path === '/api/auth/register' && method === 'POST') {
      return json({ user, accessToken: 'shot-token', token: 'shot-token' }, 201);
    }
    if (path === '/api/auth/refresh' && method === 'POST') {
      return json({ user, accessToken: 'shot-token', token: 'shot-token' });
    }
    if (path === '/api/contracts/history-1' && method === 'GET') {
      return json({
        id: 'history-1', status: 'READY', global_risk_score: 44,
        clauses: [RISKY_CLAUSE, SAFE_CLAUSE],
      });
    }
    if (path === '/api/contracts' && method === 'GET') {
      return json([{
        id: 'history-1', title: 'Synthetic demo lease', file_name: 'synthetic-demo-lease.pdf',
        status: 'READY', global_risk_score: 44, uploaded_at: '2026-11-03T12:00:00.000Z',
      }]);
    }
    return json({ code: 'NotFound', message_key: 'errors.api_error' }, 404);
  });
}

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const frontendDir = resolve(rootDir, 'frontend');
const outDir = resolve(rootDir, 'docs/img');
const baseUrlArg = process.argv.indexOf('--base-url');
const baseUrl = baseUrlArg === -1 ? 'http://127.0.0.1:5198' : process.argv[baseUrlArg + 1];

async function waitForServer(url, timeoutMs = 45_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Dev server did not start at ${url}`);
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  let devServer = null;
  if (process.env.START_DEV_SERVER === '1') {
    devServer = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5198'], {
      cwd: frontendDir,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    devServer.unref();
    await waitForServer(baseUrl);
  }
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('lang', 'en');
    });
    await mockApi(page);
    await page.goto(`${baseUrl}/register`);
    await page.locator('#register-name').fill('Audit User');
    await page.locator('#register-email').fill(`audit-${Date.now()}@example.test`);
    await page.locator('#register-password').fill('StrongPassword123!');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByText('Upload contract', { exact: true }).waitFor({ timeout: 30_000 });

    const shots = [];
    async function snap(name, theme, go) {
      await page.goto(`${baseUrl}/settings`);
      await page.locator('#settings-theme-toggle').waitFor({ timeout: 15_000 });
      const wantDark = theme === 'dark';
      await page.waitForFunction(
        (expected) => document.querySelector('#settings-theme-toggle') !== null,
        wantDark,
        { timeout: 5_000 },
      ).catch(() => {});
      const isDark = await page.evaluate(() => document.documentElement.dataset.theme === 'dark');
      if (wantDark !== isDark) {
        await page.locator('#settings-theme-toggle').click();
        await page.waitForFunction(
          (expected) => (document.documentElement.dataset.theme === 'dark') === expected,
          wantDark,
          { timeout: 5_000 },
        );
      }
      await go();
      await page.waitForTimeout(800);
      await page.screenshot({ path: resolve(outDir, `${name}-${theme}.png`) });
      shots.push(`${name}-${theme}.png`);
      console.log(`shot ${name} [${theme}]`);
    }

    await snap('login', 'light', async () => page.goto(`${baseUrl}/login`));
    await snap('home', 'light', async () => page.goto(`${baseUrl}/`));
    await snap('home', 'dark', async () => page.goto(`${baseUrl}/`));
    await snap('results', 'light', async () => {
      await page.goto(`${baseUrl}/history`);
      await page.getByRole('button', { name: 'Open Synthetic demo lease' }).click();
      await page.getByText('Analysis results').waitFor({ timeout: 15_000 });
    });
    await snap('results', 'dark', async () => {
      await page.goto(`${baseUrl}/history`);
      await page.getByRole('button', { name: 'Open Synthetic demo lease' }).click();
      await page.getByText('Analysis results').waitFor({ timeout: 15_000 });
    });
    await snap('history', 'light', async () => page.goto(`${baseUrl}/history`));
    await snap('settings', 'dark', async () => page.goto(`${baseUrl}/settings`));
    console.log(`saved: ${shots.join(', ')}`);
  } finally {
    await browser.close().catch(() => {});
    if (devServer) {
      try {
        if (process.platform === 'win32') {
          const { execFileSync } = await import('node:child_process');
          execFileSync('taskkill', ['/pid', String(devServer.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          devServer.kill('SIGKILL');
        }
      } catch { /* best effort */ }
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  process.exit(0);
}

main().catch((error) => {
  console.error('screenshots failed:', error);
  process.exit(1);
});
