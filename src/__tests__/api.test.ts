import request from 'supertest';
import app from '../server';

describe('Health Check', () => {
  it('should return health status', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'OK');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
  });
});

describe('API Documentation', () => {
  it('should serve API documentation', async () => {
    const response = await request(app)
      .get('/api-docs/')
      .expect(200);

    expect(response.text).toContain('swagger');
  });
});

describe('Authentication', () => {
  describe('POST /api/auth/nonce', () => {
    it('should generate nonce for valid wallet address', async () => {
      const response = await request(app)
        .post('/api/auth/nonce')
        .send({
          walletAddress: '0x742d35Cc6634C0532925a3b8D8Cf5a4E2A5e1234'
        })
        .expect(200);

      expect(response.body).toHaveProperty('nonce');
      expect(response.body).toHaveProperty('message');
    });

    it('should reject invalid wallet address', async () => {
      await request(app)
        .post('/api/auth/nonce')
        .send({
          walletAddress: 'invalid-address'
        })
        .expect(400);
    });
  });
});

describe('Error Handling', () => {
  it('should return 404 for non-existent routes', async () => {
    const response = await request(app)
      .get('/api/non-existent')
      .expect(404);

    expect(response.body).toHaveProperty('error', 'Route not found');
  });
});
