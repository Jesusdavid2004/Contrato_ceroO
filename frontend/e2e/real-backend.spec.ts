import { expect, test } from '@playwright/test';

/**
 * End-to-end against a REAL backend (PostgreSQL + FakeAIProvider, no mocks).
 *
 * Run: AI_PROVIDER=fake docker compose up --build -d
 *      REAL_BACKEND_URL=http://127.0.0.1:3001 npx playwright test real-backend
 *
 * Skipped by default so the stubbed suite stays hermetic in CI.
 */
const BASE_URL = process.env.REAL_BACKEND_URL ?? '';
const EMAIL = `real-${Date.now()}@example.test`;
const PASSWORD = 'RealBackendStrong123!';

test.skip(!BASE_URL, 'requires REAL_BACKEND_URL pointing at a backend with AI_PROVIDER=fake');
test.setTimeout(180_000);

function makeContractPdf(lines: string[]): Buffer {
  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objects[3] =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>';
  const content =
    'BT /F1 12 Tf 72 720 Td 14 TL ' +
    lines.map((line) => `(${line.replace(/[()\\]/g, ' ')}) Tj T*`).join(' ') +
    ' ET';
  objects[4] = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  objects[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let out = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i <= 5; i += 1) {
    offsets[i] = Buffer.byteLength(out);
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out);
  out += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => `${String(o).padStart(10, '0')} 00000 n `)
    .join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

test('register, upload, analyze, letter, pdf, and delete against the real backend', async ({
  page,
}) => {
  // Register through the UI.
  await page.goto('/register');
  await page.locator('#register-name').fill('Real Backend');
  await page.locator('#register-email').fill(EMAIL);
  await page.locator('#register-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Upload contract', { exact: true }).waitFor({ timeout: 30_000 });

  // Upload a text PDF (over 200 chars so it is not treated as scanned;
  // ASCII-only so hand-built WinAnsi encoding cannot mangle it; clauses use
  // patterns the deterministic FakeAI double actually matches)
  // and wait for the real analysis to finish.
  await page.locator('input[type="file"]').setInputFiles({
    name: 'real-contract.pdf',
    mimeType: 'application/pdf',
    buffer: makeContractPdf([
      'CLAUSULA PRIMERA. En caso de mora se cobrara una multa equivalente a la totalidad del canon anual.',
      'CLAUSULA SEGUNDA. The client must waive any right to a refund once the service has started.',
      'CLAUSULA TERCERA. El canon se reajustara cada ano segun el IPC certificado, sin excederlo.',
      'CLAUSULA CUARTA. Both parties agree to a twelve month term renewable by mutual written agreement.',
      'CLAUSULA QUINTA. El arrendatario notificara por escrito cualquier cambio de sus datos.',
    ]),
  });
  await page.getByText(/totalidad del canon/).waitFor({ timeout: 120_000 });
  await expect(page.getByText('High risk').first()).toBeVisible();

  // Generate the letter, save an edit, and download the PDF.
  await page.getByRole('button', { name: 'Generate Objection Letter' }).click();
  const letter = page.getByLabel('Editable objection letter text');
  await expect(letter).toBeVisible({ timeout: 60_000 });
  await page.getByLabel('Your name').fill('Real Tester');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Your letter changes were saved.')).toBeVisible({ timeout: 30_000 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

  // History shows the contract; delete it.
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByText('real-contract.pdf')).toBeVisible({ timeout: 30_000 });
  page.on('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: /Delete real-contract/ }).click();
  await expect(page.getByText('real-contract.pdf')).toHaveCount(0, { timeout: 30_000 });

  // Delete the whole account.
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Delete account' }).click();
  await page.locator('#settings-delete-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.waitForURL('**/register', { timeout: 30_000 });
});
