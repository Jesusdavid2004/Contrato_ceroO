import type { Page } from '@playwright/test';

const LETTER_TEMPLATE = [
  'Dear [RECIPIENT],',
  '',
  'Please review the clause in [CONTRACT REFERENCE].',
  'I request clear and balanced terms.',
  'Please provide a written response.',
  'Sincerely,',
  '[YOUR NAME]',
  '[DATE]',
].join('\n');

const RISKY_CLAUSE = {
  id: 'clause-e2e-risky',
  original_text: 'This agreement renews automatically every year unless notice is given.',
  risk_level: 'high',
  plain_explanation: 'The agreement renews automatically unless you act before the deadline.',
  confidence: 0.94,
  why_risky: 'A missed notice deadline may extend the agreement.',
  legal_basis: [],
  suggested_change: 'Request a clear reminder and a reasonable cancellation period.',
};

const SAFE_CLAUSE = {
  id: 'clause-e2e-safe',
  original_text: 'Notices will be sent to the contact details provided by each party.',
  risk_level: 'low',
  plain_explanation: 'This clause explains how the parties send notices.',
  confidence: 0.96,
  why_risky: null,
  legal_basis: [],
  suggested_change: null,
};

export interface MockApiOptions {
  flagged?: boolean;
  failFirstUpload?: boolean;
}

export interface MockApiState {
  uploadCount: number;
  generatedLetterCount: number;
  savedLetterContent: string | null;
  contractWasReadBack: boolean;
  letterWasDownloaded: boolean;
}

export async function mockContractApi(page: Page, options: MockApiOptions = {}): Promise<MockApiState> {
  const state: MockApiState = {
    uploadCount: 0,
    generatedLetterCount: 0,
    savedLetterContent: null,
    contractWasReadBack: false,
    letterWasDownloaded: false,
  };

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
    const user = {
      id: 'user-e2e',
      name: 'Alex Rivera',
      email: 'alex@example.test',
    };

    if (url.pathname === '/api/auth/register' && method === 'POST') {
      return json({ user, accessToken: 'e2e-access-token', token: 'e2e-access-token' }, 201);
    }
    if (url.pathname === '/api/auth/me' && method === 'GET') {
      return json({ user });
    }
    if (url.pathname === '/api/contracts' && method === 'POST') {
      state.uploadCount += 1;
      if (options.failFirstUpload && state.uploadCount === 1) {
        return json({ code: 'TemporaryError', message_key: 'errors.api_error' }, 503);
      }
      if (!request.headers().authorization) {
        return json({ code: 'UnauthorizedError', message_key: 'errors.unauthorized' }, 401);
      }
      return json({ id: 'contract-e2e', status: 'UPLOADED' }, 201);
    }
    if (url.pathname === '/api/contracts/contract-e2e/status' && method === 'GET') {
      return json({ status: 'READY', failure_message_key: null });
    }
    if (url.pathname === '/api/contracts/contract-e2e' && method === 'GET') {
      state.contractWasReadBack = true;
      const clauses = options.flagged === false
        ? [SAFE_CLAUSE]
        : [RISKY_CLAUSE, SAFE_CLAUSE];
      return json({
        id: 'contract-e2e',
        status: 'READY',
        global_risk_score: options.flagged === false ? 0 : 50,
        clauses,
      });
    }
    if (url.pathname === '/api/contracts/contract-e2e/letter' && method === 'POST') {
      state.generatedLetterCount += 1;
      return json({
        id: 'letter-e2e',
        contract_id: 'contract-e2e',
        locale: 'en',
        content: LETTER_TEMPLATE,
        created_at: '2026-10-13T12:00:00.000Z',
      }, 201);
    }
    if (url.pathname === '/api/contracts/contract-e2e/letter' && method === 'PUT') {
      const payload = request.postDataJSON() as { content?: unknown };
      if (typeof payload.content !== 'string' || !payload.content.trim()) {
        return json({ code: 'ValidationError', message_key: 'errors.objection_letter_invalid' }, 422);
      }
      state.savedLetterContent = payload.content;
      return json({
        id: 'letter-e2e',
        contract_id: 'contract-e2e',
        locale: 'en',
        content: payload.content,
        created_at: '2026-10-13T12:01:00.000Z',
      });
    }
    if (url.pathname === '/api/contracts/contract-e2e/letter/pdf' && method === 'GET') {
      state.letterWasDownloaded = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'content-disposition': 'attachment; filename="objection-letter.pdf"' },
        body: Buffer.from('%PDF-1.4\n% e2e generated pdf\n%%EOF'),
      });
    }
    return json({ code: 'NotFound', message_key: 'errors.api_error' }, 404);
  });

  return state;
}

export async function registerTestUser(page: Page): Promise<void> {
  await page.goto('/results');
  await page.waitForURL('**/login');
  await page.goto('/register');
  await page.locator('#register-name').fill('Alex Rivera');
  await page.locator('#register-email').fill(`alex-${Date.now()}@example.test`);
  await page.locator('#register-password').fill('StrongPassword123!');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Upload contract', { exact: true }).waitFor();
}

export async function uploadFixtureContract(page: Page): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({
    name: 'sample-contract.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nSynthetic contract fixture\n%%EOF'),
  });
}
