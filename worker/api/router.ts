/** Same-origin API routing: health, allowlisted OAuth/session endpoints and account-owned
 * builds. Unknown API paths never fall through to the SPA; production/previews fail closed.
 */
import { handleHealth } from './health';
import { accountMethods, handleAccount } from './accounts';
import type { AccountEnv } from '../auth/runtime';
import { canonicalOrigin } from '../auth/runtime';
import { failureResponse } from './security';
import { apiError, withoutBody } from './http';

/** Minimal structural view of a D1 binding, so routing is testable without workerd. */
export interface HealthDatabase {
  prepare(query: string): { first<T = Record<string, unknown>>(): Promise<T | null> };
}

export interface ApiEnv {
  DB?: HealthDatabase;
  APP_ENV?: string;
  APP_ORIGIN?: string;
}

type Handler = (request: Request, env: ApiEnv) => Promise<Response>;

const ROUTES: ReadonlyMap<string, Readonly<Partial<Record<string, Handler>>>> = new Map([
  ['/api/health', { GET: (_request, env) => handleHealth(env) }],
]);

export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export async function handleApiRequest(request: Request, env: ApiEnv & Omit<AccountEnv, 'DB'>): Promise<Response> {
  const { pathname } = new URL(request.url);
  const methods = ROUTES.get(pathname);
  const account = accountMethods(pathname);
  if (!methods && !account) return apiError(404, 'not_found', 'Unknown API route.');
  const isHead = request.method === 'HEAD';
  const method = isHead ? 'GET' : request.method;
  const allowed = methods ? Object.keys(methods) : account!;
  if (!allowed.includes(method)) {
    return apiError(405, 'method_not_allowed', 'Method not allowed.', {
      allow: allowed.flatMap(m => m === 'GET' ? ['GET', 'HEAD'] : [m]).join(', '),
    });
  }
  try {
    // Health never reads a mistakenly inherited database on a preview origin. Local health
    // works before auth configuration, so existing local migration/smoke tooling stays useful.
    if (methods && env.APP_ENV !== 'local' && !canonicalOrigin(request, env as AccountEnv)) {
      const disabled = apiError(503, 'not_configured', 'Account features are not available on this deployment.');
      return isHead ? withoutBody(disabled) : disabled;
    }
    const response = methods ? await methods[method]!(request, env) : await handleAccount(
      isHead ? new Request(request.url, { headers: request.headers }) : request, env as AccountEnv);
    response.headers.set('cache-control', 'no-store');
    response.headers.set('x-content-type-options', 'nosniff');
    response.headers.set('referrer-policy', 'no-referrer');
    return isHead ? withoutBody(response) : response;
  } catch (error) {
    const response = failureResponse(error);
    return isHead ? withoutBody(response) : response;
  }
}
