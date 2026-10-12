import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { FileValidator } from '../src/infrastructure/services/FileValidator';
import { UnsupportedFileTypeError, FileTooLargeError } from '../src/domain/exceptions/index';

describe('Auth Hardening & Upload Pipeline (Phase 3)', () => {
  const app = createApp({ inMemory: true });

  const userA = {
    name: 'Alice Tenant',
    email: `alice_${Date.now()}@example.com`,
    password: 'Password123!',
  };

  const userB = {
    name: 'Bob Consumer',
    email: `bob_${Date.now()}@example.com`,
    password: 'Password123!',
  };

  let tokenA = '';
  let refreshCookieA = '';
  let tokenB = '';

  describe('FileValidator Magic Bytes Unit Tests', () => {
    it('validates genuine PDF magic bytes (%PDF-)', () => {
      const pdfBuffer = Buffer.from('%PDF-1.4\n%test pdf content\n%%EOF');
      const result = FileValidator.validate(pdfBuffer, 'contract.pdf');
      expect(result.detectedMime).toBe('application/pdf');
    });

    it('validates genuine PNG magic bytes', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
      const result = FileValidator.validate(pngBuffer, 'scan.png');
      expect(result.detectedMime).toBe('image/png');
    });

    it('validates genuine JPEG magic bytes', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
      const result = FileValidator.validate(jpegBuffer, 'photo.jpg');
      expect(result.detectedMime).toBe('image/jpeg');
    });

    it('rejects spoofed file with fake extension', () => {
      const fakePdf = Buffer.from('Just plain text pretending to be a PDF file');
      expect(() => FileValidator.validate(fakePdf, 'spoofed.pdf')).toThrow(UnsupportedFileTypeError);
    });

    it('rejects files exceeding 10MB limit', () => {
      const largeBuffer = Buffer.alloc(10 * 1024 * 1024 + 100);
      expect(() => FileValidator.validate(largeBuffer, 'huge.pdf')).toThrow(FileTooLargeError);
    });
  });

  describe('Hardened Auth Flow with httpOnly Cookies and Refresh Rotation', () => {
    it('registers User A, returns access token, and sets httpOnly refresh cookie', async () => {
      const res = await request(app).post('/api/v1/auth/register').send(userA);

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe(userA.email);

      tokenA = res.body.accessToken;

      // Verify Set-Cookie header for cc_refresh_token
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const refreshCookie = cookies?.find((c: string) => c.startsWith('cc_refresh_token='));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
      refreshCookieA = refreshCookie || '';
    });

    it('registers User B', async () => {
      const res = await request(app).post('/api/v1/auth/register').send(userB);
      expect(res.status).toBe(201);
      tokenB = res.body.accessToken;
    });

    it('POST /api/v1/auth/login sets httpOnly refresh cookie and returns tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: userA.email, password: userA.password });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('POST /api/v1/auth/refresh rotates refresh token and returns fresh access token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [refreshCookieA]);

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe(userA.email);

      // Verify new rotated cookie is emitted
      const newCookies = res.headers['set-cookie'];
      expect(newCookies).toBeDefined();
      tokenA = res.body.accessToken;
    });

    it('POST /api/v1/auth/logout clears refresh cookie', async () => {
      const res = await request(app).post('/api/v1/auth/logout');
      expect(res.status).toBe(200);
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const clearedCookie = cookies?.find((c: string) => c.startsWith('cc_refresh_token=;'));
      expect(clearedCookie).toBeDefined();
    });
  });

  describe('Secure Upload Pipeline and Resource Ownership Enforcement', () => {
    let contractIdA = '';

    it('rejects uploads without Bearer authentication', async () => {
      const validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
      const res = await request(app)
        .post('/api/v1/contracts')
        .attach('contract', validPdfBuffer, 'lease.pdf');

      expect(res.status).toBe(401);
    });

    it('rejects uploads with spoofed non-PDF/image content', async () => {
      const fakeBuffer = Buffer.from('Plain text fake contract');
      const res = await request(app)
        .post('/api/v1/contracts')
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('contract', fakeBuffer, 'spoofed.pdf');

      expect(res.status).toBe(415);
      expect(res.body.code).toBe('UnsupportedFileTypeError');
    });

    it('allows User A to upload a valid contract', async () => {
      const validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
      const res = await request(app)
        .post('/api/v1/contracts')
        .set('Authorization', `Bearer ${tokenA}`)
        .field('contract_type', 'LEASE')
        .field('jurisdiction', 'CO')
        .field('locale', 'es')
        .field('title', 'Apartment Lease 2026')
        .attach('contract', validPdfBuffer, 'lease_2026.pdf');

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('UPLOADED');
      expect(res.body.title).toBe('Apartment Lease 2026');
      contractIdA = res.body.id;
    });

    it('User A can view their contract details', async () => {
      const res = await request(app)
        .get(`/api/v1/contracts/${contractIdA}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(contractIdA);
    });

    it('User B is FORBIDDEN from viewing User A contract (Ownership Check)', async () => {
      const res = await request(app)
        .get(`/api/v1/contracts/${contractIdA}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ContractOwnershipError');
    });

    it('User B is FORBIDDEN from deleting User A contract', async () => {
      const res = await request(app)
        .delete(`/api/v1/contracts/${contractIdA}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ContractOwnershipError');
    });

    it('DELETE /api/v1/auth/me hard deletes account and all associated contracts', async () => {
      const res = await request(app)
        .delete('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted');

      // Verify contract no longer exists
      const checkRes = await request(app)
        .get(`/api/v1/contracts/${contractIdA}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(checkRes.status).toBe(404); // Contract is deleted
    });
  });
});
