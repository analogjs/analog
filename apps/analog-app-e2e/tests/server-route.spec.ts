import { test, expect } from '@playwright/test';

test.describe('defineServerRoute - /api/v1/echo', () => {
  test('should validate and echo POST body', async ({ request }) => {
    const response = await request.post('/api/v1/echo', {
      data: { message: 'hello' },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.echo).toBe('hello');
    expect(body.method).toBe('POST');
  });

  test('should validate GET query params', async ({ request }) => {
    const response = await request.get('/api/v1/echo?message=world');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.echo).toBe('world');
    expect(body.method).toBe('GET');
  });

  test('should return 422 on validation failure', async ({ request }) => {
    const response = await request.post('/api/v1/echo', {
      data: { message: '' },
    });

    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body[0].message).toBe('message is required');
  });

  test('should return 422 when input is missing', async ({ request }) => {
    const response = await request.post('/api/v1/echo', {
      data: {},
    });

    expect(response.status()).toBe(422);
  });
});
