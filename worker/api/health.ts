/**
 * GET /api/health — liveness plus a real `SELECT 1` against the D1 binding.
 * Reports only coarse states; never error text, bindings, IDs, SQL or configuration.
 */
import { jsonResponse } from './http';
import type { ApiEnv } from './router';

export type DatabaseState = 'ok' | 'not_configured' | 'error';

export interface HealthBody {
  status: 'ok' | 'unavailable';
  service: 'gorgonbuilder-api';
  environment: string;
  database: DatabaseState;
}

export async function checkDatabase(env: ApiEnv): Promise<DatabaseState> {
  if (!env.DB) return 'not_configured';
  try {
    const row = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    return row?.ok === 1 ? 'ok' : 'error';
  } catch (error) {
    // Log the failure class only; D1 messages can echo SQL or internal identifiers.
    console.error('health: database check failed', error instanceof Error ? error.name : typeof error);
    return 'error';
  }
}

export async function handleHealth(env: ApiEnv): Promise<Response> {
  const database = await checkDatabase(env);
  const body: HealthBody = {
    status: database === 'ok' ? 'ok' : 'unavailable',
    service: 'gorgonbuilder-api',
    environment: env.APP_ENV ?? 'unknown',
    database,
  };
  return jsonResponse(body, database === 'ok' ? 200 : 503);
}
