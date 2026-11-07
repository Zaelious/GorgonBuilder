/** JSON response helpers for same-origin `/api/*` routes. API paths never return SPA HTML. */

export type ApiErrorCode = string;

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}

const API_HEADERS: Readonly<Record<string, string>> = {
  'content-type': 'application/json; charset=utf-8',
  // API data can be private once accounts exist; never cache it in shared caches.
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...API_HEADERS, ...headers } });
}

export function apiError(status: number, code: ApiErrorCode, message: string, headers: Record<string, string> = {}): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return jsonResponse(body, status, headers);
}

/** HEAD responses keep status and headers but carry no body. */
export function withoutBody(response: Response): Response {
  return new Response(null, { status: response.status, headers: response.headers });
}
