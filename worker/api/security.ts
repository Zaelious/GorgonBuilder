import type { BuildDatabase } from '../../src/persistence/remote/d1';
import { apiError } from './http';

export class RequestFailure extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

/** Stream and count bytes before parsing. Content-Length is only an early-rejection hint. */
export async function readJson(request: Request, maxBytes = 272 * 1024): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new RequestFailure(415, 'unsupported_media_type', 'Use application/json.');
  }
  if (Number(request.headers.get('content-length')) > maxBytes) throw new RequestFailure(413, 'payload_too_large', 'Request is too large.');
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxBytes) {
          await reader.cancel();
          throw new RequestFailure(413, 'payload_too_large', 'Request is too large.');
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new RequestFailure(400, 'invalid_json', 'Expected a JSON object.'); }
}

export function onlyKeys(body: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(body).some(key => !keys.includes(key))) throw new RequestFailure(400, 'invalid_request', 'Unknown request field.');
}

export function checkOrigin(request: Request, canonical: string): void {
  if (request.headers.get('origin') !== canonical || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new RequestFailure(403, 'invalid_origin', 'Use the canonical site to perform this action.');
  }
}

/** Globally shared D1 fixed window. No isolate-local limiter, paid service or plaintext IP log.
 * Cloudflare supplies CF-Connecting-IP at the edge (never trust X-Forwarded-For).
 */
export async function enforceRateLimit(db: BuildDatabase, scope: string, identity: string, max: number, now = Date.now()): Promise<void> {
  const key = `${scope}:${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(identity)))).map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
  const start = Math.floor(now / 60000) * 60000;
  const row = await db.prepare(`INSERT INTO api_rate_limit (key, window_start, attempts) VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN window_start = excluded.window_start
      THEN attempts + 1 ELSE 1 END, window_start = excluded.window_start RETURNING attempts`)
    .bind(key, start).first<{ attempts: number }>();
  // Bounded indexed cleanup, never a full-table scan. No per-request timers/cron.
  await db.prepare(`DELETE FROM api_rate_limit WHERE key IN
    (SELECT key FROM api_rate_limit WHERE window_start < ? ORDER BY window_start LIMIT 100)`)
    .bind(start - 120000).run();
  if (!row || row.attempts > max) throw new RequestFailure(429, 'rate_limited', 'Too many requests. Try again in one minute.');
}

export function failureResponse(error: unknown): Response {
  if (error instanceof RequestFailure) return apiError(error.status, error.code, error.message,
    error.status === 429 ? { 'retry-after': '60' } : {});
  // No error objects, SQL, request bodies or provider messages are logged.
  return apiError(503, 'unavailable', 'The account service is temporarily unavailable.');
}
