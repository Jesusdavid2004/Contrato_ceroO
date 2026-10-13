import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('Layered backend API compatibility', () => {
  const app = createApp({ inMemory: true });

  it('supports the auth, asynchronous upload, and polling routes used by the frontend', async () => {
    const email = `runtime_${Date.now()}@example.com`;
    const registration = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Runtime Test', email, password: 'StrongPassword123!' });

    expect(registration.status).toBe(201);
    const token = registration.body.token as string;
    const upload = await request(app)
      .post('/api/contracts')
      .set('Authorization', `Bearer ${token}`)
      .attach('contract', Buffer.from('%PDF-1.4\n%%EOF'), 'runtime.pdf');

    expect(upload.status).toBe(201);
    expect(upload.body.status).toBe('UPLOADED');

    const status = await request(app)
      .get(`/api/contracts/${upload.body.id}/status`)
      .set('Authorization', `Bearer ${token}`);
    expect(status.status).toBe(200);
    expect(['UPLOADED', 'ANALYZING', 'READY', 'FAILED']).toContain(status.body.status);
    expect(status.body).toHaveProperty('failure_message_key');

    const result = await request(app)
      .get(`/api/contracts/${upload.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty('global_risk_score');
    expect(result.body).toHaveProperty('clauses');
  });
});
