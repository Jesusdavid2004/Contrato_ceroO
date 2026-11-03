#!/usr/bin/env node
/**
 * Accessibility audit with axe-core (serious + critical only fail the run).
 * Serves the frontend with Vite, drives the main pages with a mocked API,
 * and writes raw JSON plus a Markdown summary to docs/quality/.
 *
 * Usage: node scripts/axe-audit.mjs [--base-url http://127.0.0.1:5199]
 * Requires: npm run dev running on the base URL, OR let the script start it
 * with START_DEV_SERVER=1.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const frontendDir = resolve(rootDir, 'frontend');
const outDir = resolve(rootDir, 'docs/quality');
const baseUrl = process.argv.includes('--base-url')
  ? process.argv[process.argv.indexOf('--base-url') + 1]
  : 'http://127.0.0.1:5199';

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
  let exitCode = 0;
  if (process.env.START_DEV_SERVER === '1') {
    devServer = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5199'], {
      cwd: frontendDir,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    // Never let the child hold this process open.
    devServer.unref();
    await waitForServer(baseUrl);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  // Deterministic locale: the audit asserts English accessible names.
  // (Fresh profiles may otherwise resolve navigator.language to Spanish.)
  await context.addInitScript(() => {
    window.localStorage.setItem('lang', 'en');
  });
  const summary = [];
  try {
    // AxeBuilder requires a context-owned page (see axe-core error docs).
    const page = await context.newPage();
    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const path = url.pathname.replace(/^\/api\/v1\//, '/api/');
      const json = (body, status = 200) => route.fulfill({
        status, contentType: 'application/json', body: JSON.stringify(body),
      });
      const user = { id: 'u1', name: 'Alex Rivera', email: 'alex@example.test' };
      if (path === '/api/auth/register') return json({ user, accessToken: 't', token: 't' }, 201);
      // Behave like the real backend with a valid refresh cookie: full page
      // loads restore the in-memory session, so goto() keeps the user logged in.
      if (path === '/api/auth/refresh') return json({ user, accessToken: 't', token: 't' });
      if (path === '/api/contracts/history-1' && req.method() === 'GET') {
        return json({
          id: 'history-1', status: 'READY', global_risk_score: 44,
          clauses: [{
            id: 'c1', original_text: 'Sample clause text for accessibility audit.',
            risk_level: 'medium', plain_explanation: 'Explanation.', confidence: 0.7,
            why_risky: 'Why.', legal_basis: [], suggested_change: null,
          }],
        });
      }
      if (path === '/api/contracts' && req.method() === 'GET') {
        return json([{
          id: 'history-1', title: 'Audit lease', file_name: 'audit.pdf',
          status: 'READY', global_risk_score: 44, uploaded_at: '2026-11-03T00:00:00.000Z',
        }]);
      }
      return json({ code: 'NotFound', message_key: 'errors.api_error' }, 404);
    });

    // Register once to unlock the authenticated shell.
    await page.goto(`${baseUrl}/register`);
    await page.locator('#register-name').fill('Audit User');
    await page.locator('#register-email').fill(`audit-${Date.now()}@example.test`);
    await page.locator('#register-password').fill('StrongPassword123!');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByText('Upload contract', { exact: true }).waitFor({ timeout: 30_000 });

    const flows = [
      { name: 'home', go: async () => page.goto(`${baseUrl}/`) },
      { name: 'history', go: async () => page.goto(`${baseUrl}/history`) },
      { name: 'settings', go: async () => page.goto(`${baseUrl}/settings`) },
      {
        name: 'results',
        go: async () => {
          await page.goto(`${baseUrl}/history`);
          await page.getByRole('button', { name: 'Open Audit lease' }).click();
          await page.getByText('Analysis results').waitFor({ timeout: 15_000 });
        },
      },
      { name: 'login', go: async () => page.goto(`${baseUrl}/login`) },
      { name: 'privacy', go: async () => page.goto(`${baseUrl}/privacy`) },
    ];

    for (const theme of ['light', 'dark']) {
      await page.goto(`${baseUrl}/settings`);
      await page.waitForSelector('#settings-theme-toggle', { timeout: 15_000 });
      const wantDark = theme === 'dark';
      const isDark = await page.evaluate(() => document.documentElement.dataset.theme === 'dark');
      if (wantDark !== isDark) {
        await page.locator('#settings-theme-toggle').click();
      }
      for (const flow of flows) {
        await flow.go();
        await page.waitForTimeout(800);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze();
        const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        writeFileSync(`${outDir}/axe-${flow.name}-${theme}.json`, JSON.stringify(results, null, 2));
        summary.push({ page: flow.name, theme, violations: results.violations.length, serious: serious.length });
        console.log(`axe ${flow.name} [${theme}]: ${results.violations.length} violations (${serious.length} serious/critical)`);
      }
    }
  } finally {
    try {
      await browser.close();
    } catch { /* already closed */ }
    if (devServer) {
      try {
        if (process.platform === 'win32') {
          const { execFileSync } = await import('node:child_process');
          execFileSync('taskkill', ['/pid', String(devServer.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          devServer.kill('SIGKILL');
        }
      } catch { /* best effort cleanup */ }
    }
  }

  const failing = summary.filter((s) => s.serious > 0);
  const md = [
    '# Accessibility audit (axe-core, WCAG 2.0/2.1 A+AA)',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    '**Scope:** Home, History, Settings, Results, Login, Privacy, light and dark themes.',
    '',
    '| Page | Theme | Violations | Serious/Critical |',
    '|---|---|---:|---:|',
    ...summary.map((s) => `| ${s.page} | ${s.theme} | ${s.violations} | ${s.serious} |`),
    '',
    failing.length === 0
      ? 'No serious or critical violations. Raw JSON per page/theme in this folder.'
      : `**${failing.length} page/theme combos have serious/critical violations — fix before release.**`,
    '',
  ].join('\n');
  writeFileSync(`${outDir}/axe-summary.md`, md);
  if (failing.length > 0) {
    console.error('Serious/critical axe violations found.');
    exitCode = 1;
  }
  // Flush stdout, then terminate deterministically (no orphan handles).
  await new Promise((resolve) => setTimeout(resolve, 100));
  process.exit(exitCode);
}

main().catch((error) => {
  console.error('axe audit failed:', error);
  process.exit(1);
});
