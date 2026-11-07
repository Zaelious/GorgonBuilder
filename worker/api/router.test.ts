// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handleApiRequest, isApiPath, type ApiEnv, type HealthDatabase } from './router';

const ORIGIN = 'https://gorgonbuilder.zbailouz7.workers.dev';

function database(first: () => Promise<unknown>): HealthDatabase {
  return { prepare: () => ({ first: first as never }) };
}

const healthyEnv: ApiEnv = { APP_ENV: 'local', DB: database(async () => ({ ok: 1 })) };

async function call(path: string, init: RequestInit = {}, env: ApiEnv = healthyEnv) {
  const response = await handleApiRequest(new Request(`${ORIGIN}${path}`, init), env);
  const text = await response.text();
  return { response, text, body: text ? JSON.parse(text) as unknown : null };
}

describe('API routing', () => {
  it('classifies only /api and /api/* as API paths', () => {
    expect(['/api', '/api/', '/api/health', '/api/x/y'].every(isApiPath)).toBe(true);
    expect(['/', '/apix', '/builds/api', '/assets/api.js', '/API/health'].some(isApiPath)).toBe(false);
  });

  it('GET /api/health runs a real query and reports coarse status', async () => {
    const first = vi.fn(async () => ({ ok: 1 }));
    const prepare = vi.fn(() => ({ first: first as never }));
    const { response, body } = await call('/api/health', {}, { APP_ENV: 'local', DB: { prepare } });
    expect(response.status).toBe(200);
    expect(prepare).toHaveBeenCalledWith('SELECT 1 AS ok');
    expect(body).toEqual({ status: 'ok', service: 'gorgonbuilder-api', environment: 'local', database: 'ok' });
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('reports a missing D1 binding as 503 not_configured', async () => {
    const { response, body } = await call('/api/health', {}, { APP_ENV: 'production' });
    expect(response.status).toBe(503);
    expect(body).toEqual({ status: 'unavailable', service: 'gorgonbuilder-api', environment: 'production', database: 'not_configured' });
  });

  it('reports database failures without leaking error details', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = database(async () => { throw new Error('D1_ERROR: secret table "user" at db 1234'); });
    const { response, text } = await call('/api/health', {}, { APP_ENV: 'local', DB: failing });
    expect(response.status).toBe(503);
    expect(JSON.parse(text)).toMatchObject({ status: 'unavailable', environment: 'local', database: 'error' });
    expect(text).not.toMatch(/secret|D1_ERROR|1234/);
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(/secret|1234/);
    consoleError.mockRestore();
    const wrong = await call('/api/health', {}, { APP_ENV: 'local', DB: database(async () => null) });
    expect(wrong.response.status).toBe(503);
  });

  it('HEAD /api/health returns status and headers without a body', async () => {
    const { response, text } = await call('/api/health', { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(text).toBe('');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const disabled = await call('/api/health', { method: 'HEAD' }, { APP_ENV: 'preview' });
    expect(disabled.response.status).toBe(503);
    expect(disabled.text).toBe('');
  });

  it.each(['/api', '/api/', '/api/nope', '/api/health/', '/api/health/extra', '/api/builds/invalid', '/api/auth/sign-in'])(
    'unknown API path %s is a JSON 404, never SPA HTML',
    async path => {
      const { response, body, text } = await call(path);
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toMatch(/^application\/json/);
      expect(body).toEqual({ error: { code: 'not_found', message: 'Unknown API route.' } });
      expect(text).not.toMatch(/<html/i);
    });

  it('wrong methods on known routes are JSON 405 with Allow', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const { response, body } = await call('/api/health', { method });
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, HEAD');
      expect(body).toEqual({ error: { code: 'method_not_allowed', message: 'Method not allowed.' } });
    }
  });

  it('ignores query strings for routing', async () => {
    expect((await call('/api/health?verbose=1')).response.status).toBe(200);
  });
});
