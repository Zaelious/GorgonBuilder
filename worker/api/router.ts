/**
 * Same-origin API router. `wrangler.jsonc` sends only `/api` and `/api/*` to the Worker
 * first (`assets.run_worker_first`); everything else is served by Static Assets with the
 * SPA fallback and never reaches this code.
 *
 * T0018 routes: GET/HEAD /api/health. Every other `/api/*` path is a JSON 404, and a known
 * path with the wrong method is a JSON 405 — never the SPA index.html.
 */
import { handleHealth } from './health';
import { apiError, withoutBody } from './http';

/** Minimal structural view of a D1 binding, so routing is testable without workerd. */
export interface HealthDatabase {
  prepare(query: string): { first<T = Record<string, unknown>>(): Promise<T | null> };
}

export interface ApiEnv {
  DB?: HealthDatabase;
  APP_ENV?: string;
}

type Handler = (request: Request, env: ApiEnv) => Promise<Response>;

const ROUTES: ReadonlyMap<string, Readonly<Partial<Record<string, Handler>>>> = new Map([
  ['/api/health', { GET: (_request, env) => handleHealth(env) }],
]);

export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export async function handleApiRequest(request: Request, env: ApiEnv): Promise<Response> {
  const { pathname } = new URL(request.url);
  const methods = ROUTES.get(pathname);
  if (!methods) return apiError(404, 'not_found', 'Unknown API route.');

  const isHead = request.method === 'HEAD';
  const handler = methods[isHead ? 'GET' : request.method];
  if (!handler) {
    const allow = Object.keys(methods).flatMap(method => method === 'GET' ? ['GET', 'HEAD'] : [method]).join(', ');
    return apiError(405, 'method_not_allowed', 'Method not allowed.', { allow });
  }
  try {
    const response = await handler(request, env);
    return isHead ? withoutBody(response) : response;
  } catch (error) {
    console.error('api: unhandled error', pathname, error instanceof Error ? error.name : typeof error);
    return apiError(500, 'internal_error', 'Internal error.');
  }
}
