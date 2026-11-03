import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Logger } from '../src/shared/logger';
import { errorHandler } from '../src/shared/errors/errorHandler';

const SECRET_CLAUSE = 'El arrendador podrá terminar unilateralmente sin previo aviso.';

/**
 * Privacy guarantee, pinned by tests:
 * 1. The logger redacts sensitive keys (tokens, passwords, clause/contract text).
 * 2. No first-party logger call site passes raw clause/contract text.
 * 3. Unexpected errors produce a generic response that never echoes input.
 */
describe('log privacy (no contract text in logs or error responses)', () => {
  it('redacts sensitive keys, including nested objects and arrays', () => {
    const logger = new Logger();
    const cleaned = logger.sanitize({
      user: 'u1',
      token: 'abc',
      nested: { original_text: SECRET_CLAUSE, ok: true },
      list: [{ contract_text: SECRET_CLAUSE }],
    }) as Record<string, unknown>;
    expect(cleaned.user).toBe('u1');
    expect(cleaned.token).toBe('[REDACTED]');
    expect((cleaned.nested as Record<string, unknown>).original_text).toBe('[REDACTED]');
    expect(((cleaned.list as unknown[])[0] as Record<string, unknown>).contract_text).toBe('[REDACTED]');
  });

  it('never passes raw clause or contract text at any logger call site', () => {
    const srcDir = path.resolve(__dirname, '../src');
    const files = walk(srcDir);
    const offenders: string[] = [];
    const callSite = /logger\.(info|warn|error|debug)\(/;
    const rawText = /original_?text|contract_?text|clause_?text|\.text\b|req\.body/;
    for (const file of files) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      let depth = 0;
      let windowStart = -1;
      lines.forEach((line, index) => {
        if (depth === 0 && callSite.test(line)) {
          windowStart = index;
        }
        if (windowStart >= 0) {
          depth += (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
          if (rawText.test(line)) {
            offenders.push(`${path.relative(srcDir, file)}:${index + 1}`);
          }
          if (depth <= 0) {
            depth = 0;
            windowStart = -1;
          }
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('returns a generic 500 body that never echoes the failure input', () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const res = { status, json } as unknown as Parameters<typeof errorHandler>[2];
    const req = {} as Parameters<typeof errorHandler>[1];
    const err = new Error(`boom with user content: ${SECRET_CLAUSE}`);
    errorHandler(err, req, res, () => {});
    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain(SECRET_CLAUSE);
    expect(body).toEqual({ code: 'InternalServerError', message_key: 'errors.internal_error' });
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}
