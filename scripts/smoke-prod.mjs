#!/usr/bin/env node
/**
 * Smoke test against a deployed ContratoClaro base URL:
 * register -> upload -> poll READY -> get result -> letter -> PDF ->
 * delete contract -> delete account. Exits non-zero on any failure.
 *
 * Usage: node scripts/smoke-prod.mjs --base-url https://api.example.com \
 *   --email smoke@example.test --password 'StrongPassword123!'
 *
 * Requires Node 18+ (global fetch/FormData/Blob). No dependencies.
 */
import { argv, exit, env } from 'node:process';

function arg(name, fallback = undefined) {
  const i = argv.indexOf(`--${name}`);
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  return fallback ?? env[name.toUpperCase().replace(/-/g, '_')];
}

const BASE_URL = (arg('base-url') || '').replace(/\/$/, '');
const EMAIL = arg('email', `smoke-${Date.now()}@example.test`);
const PASSWORD = arg('password', 'SmokeStrong123!');
if (!BASE_URL) {
  console.error('Missing --base-url (e.g. https://contratoclaro-api.onrender.com)');
  exit(2);
}

function makePdf(lines) {
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objs[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>';
  const content = 'BT /F1 12 Tf 72 720 Td 14 TL ' + lines.map((l) => `(${l}) Tj T*`).join(' ') + ' ET';
  objs[4] = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  objs[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let out = '%PDF-1.4\n';
  const offs = [0];
  for (let i = 1; i <= 5; i += 1) {
    offs[i] = Buffer.byteLength(out);
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out);
  out += `xref\n0 6\n0000000000 65535 f \n${offs.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

const steps = [];
function check(name, ok, detail = '') {
  steps.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) {
    console.error('Smoke test failed.');
    exit(1);
  }
}

const api = async (path, { method = 'GET', token, body, json } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* binary or empty */ }
  return { res, text, parsed };
};

const ready = await api('/ready').catch(() => null);
check('readiness probe', !!ready && ready.res.ok && ready.parsed?.status === 'ready');

const reg = await api('/api/v1/auth/register', {
  method: 'POST',
  json: { name: 'Smoke Test', email: EMAIL, password: PASSWORD },
});
check('register', reg.res.status === 201 && !!reg.parsed?.accessToken, `http=${reg.res.status}`);
const token = reg.parsed.accessToken;

const form = new FormData();
form.append('contract', new Blob([makePdf([
  'CLAUSULA PRIMERA. En caso de mora se cobrara una multa equivalente a la totalidad del canon anual.',
  'CLAUSULA SEGUNDA. The client must waive any right to a refund once the service has started.',
  'CLAUSULA TERCERA. El canon se reajustara cada ano segun el IPC certificado.',
  'CLAUSULA CUARTA. Both parties agree to a twelve month term.',
])], { type: 'application/pdf' }), 'smoke.pdf');
form.append('locale', 'en');
const upload = await api('/api/contracts', { method: 'POST', token, body: form });
check('upload accepted', upload.res.status === 201 && !!upload.parsed?.id, `http=${upload.res.status}`);
const contractId = upload.parsed.id;

let status = 'UPLOADED';
for (let i = 0; i < 60; i += 1) {
  await new Promise((r) => setTimeout(r, 5000));
  const s = await api(`/api/contracts/${contractId}/status`, { token });
  status = s.parsed?.status;
  if (status === 'READY' || status === 'FAILED') break;
}
check('analysis reaches READY', status === 'READY', `status=${status}`);

const result = await api(`/api/contracts/${contractId}`, { token });
const highs = (result.parsed?.clauses || []).filter((c) => c.risk_level === 'high').length;
check('flagged clauses detected', result.res.ok && highs >= 2, `high=${highs}`);

const letter = await api(`/api/contracts/${contractId}/letter`, { method: 'POST', token });
check('letter generated', letter.res.status === 201 && !!letter.parsed?.id, `http=${letter.res.status}`);

const pdf = await api(`/api/contracts/${contractId}/letter/pdf`, { token });
check('letter PDF downloads', pdf.res.ok && pdf.text.startsWith('%PDF'), `http=${pdf.res.status}`);

const delContract = await api(`/api/contracts/${contractId}`, { method: 'DELETE', token });
check('contract deleted', delContract.res.ok, `http=${delContract.res.status}`);

const delAccount = await api('/api/v1/auth/me', { method: 'DELETE', token });
check('account deleted', delAccount.res.ok, `http=${delAccount.res.status}`);
console.log('Smoke test passed: register -> upload -> result -> letter -> pdf -> delete.');
