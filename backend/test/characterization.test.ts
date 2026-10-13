import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

describe('Legacy Backend Characterization Tests', () => {
  const testUser = {
    name: 'Characterization User',
    email: `char_test_${Date.now()}@example.com`,
    password: 'password123',
  };
  let authToken = '';

  it('GET /api/health returns 200 and status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  describe('Authentication flow', () => {
    it('POST /api/auth/register validates required fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'incomplete@example.com' });
      expect(res.status).toBe(422);
      expect(res.body.error).toContain('name, email, and password are required');
    });

    it('POST /api/auth/register validates minimum password length', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Short', email: 'short@example.com', password: '123' });
      expect(res.status).toBe(422);
      expect(res.body.error).toContain('at least 8 characters');
    });

    it('POST /api/auth/register successfully registers a new user', async () => {
      const res = await request(app).post('/api/auth/register').send(testUser);
      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toMatchObject({
        name: testUser.name,
        email: testUser.email,
      });
      authToken = res.body.token;
    });

    it('POST /api/auth/register rejects duplicate registration with 409', async () => {
      const res = await request(app).post('/api/auth/register').send(testUser);
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already registered');
    });

    it('POST /api/auth/login validates credentials and returns token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);
    });

    it('POST /api/auth/login rejects wrong password with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: 'wrongpassword' });
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid email or password');
    });

    it('GET /api/auth/me rejects unauthenticated requests', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    it('GET /api/auth/me returns current user profile when authenticated', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(testUser.email);
    });
  });

  describe('Contract operations', () => {
    let createdContractId = '';

    it('POST /api/contracts/analyze rejects without auth', async () => {
      const res = await request(app).post('/api/contracts/analyze');
      expect(res.status).toBe(401);
    });

    it('POST /api/contracts/analyze rejects when no file is uploaded', async () => {
      const res = await request(app)
        .post('/api/contracts/analyze')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No file uploaded');
    });

    it('POST /api/contracts/analyze analyzes an uploaded image/png contract', async () => {
      const dummyImageBuffer = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C63000100000500010D0A2DB40000000049454E44AE426082', 'hex');

      const res = await request(app)
        .post('/api/contracts/analyze')
        .set('Authorization', `Bearer ${authToken}`)
        .field('locale', 'es')
        .attach('contract', dummyImageBuffer, {
          filename: 'test_contract.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
      expect(res.body.clauses).toBeInstanceOf(Array);
      expect(res.body.global_risk_score).toBeGreaterThanOrEqual(0);
      createdContractId = res.body.id;
    }, 10000);

    it('GET /api/contracts returns list containing the user contract', async () => {
      const res = await request(app)
        .get('/api/contracts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find((c: { id: string }) => c.id === createdContractId);
      expect(found).toBeDefined();
    });

    it('DELETE /api/contracts/:id deletes the created contract', async () => {
      const res = await request(app)
        .delete(`/api/contracts/${createdContractId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Contract deleted');

      const checkRes = await request(app)
        .delete(`/api/contracts/${createdContractId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(checkRes.status).toBe(404);
    });
  });
});
