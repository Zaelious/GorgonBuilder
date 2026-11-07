/**
 * T0018 AUTH FEASIBILITY PROBE — local-only Worker, never deployed.
 *
 * Runs Better Auth inside workerd against a *local* D1 database migrated with the committed
 * migrations, using inert placeholder OAuth client IDs (no network calls, no real secrets).
 * `npm run worker:smoke` starts it with `wrangler dev --local` and checks: auth routes respond,
 * OAuth sign-in initiation produces a provider redirect + HttpOnly state cookie and a D1 write,
 * foreign origins and unsafe callback URLs are rejected, and a session written to D1 is
 * validated from a signed cookie and revoked by sign-out.
 */
import { betterAuth } from 'better-auth';
import { isAPIError } from 'better-auth/api';
import { createAuthOptions } from './auth-options';

interface ProbeEnv {
  DB: D1Database;
  PROBE_ORIGIN: string;
}

/** Deliberately public, probe-only value. Real secrets come from `wrangler secret put`. */
const PROBE_SECRET = 'gorgonbuilder-local-auth-probe-not-a-secret-000000';
const PLACEHOLDER = { clientId: 'probe-placeholder-client-id', clientSecret: 'probe-placeholder-client-secret' };

function createAuth(env: ProbeEnv) {
  return betterAuth(createAuthOptions({
    database: env.DB, baseURL: env.PROBE_ORIGIN, secret: PROBE_SECRET, discord: PLACEHOLDER, google: PLACEHOLDER,
  }));
}

/** Same HMAC-SHA256 signed-cookie format Better Auth sets after a real OAuth callback. */
async function signCookieValue(value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(PROBE_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
  return encodeURIComponent(`${value}.${btoa(String.fromCharCode(...signature))}`);
}

export default {
  async fetch(request, env): Promise<Response> {
    const auth = createAuth(env);
    const { pathname } = new URL(request.url);
    if (pathname === '/__probe/session' && request.method === 'POST') {
      // Stand-in for a completed OAuth callback: create user + session rows in D1.
      const context = await auth.$context;
      const user = await context.internalAdapter.createUser({
        email: `probe-${crypto.randomUUID()}@example.invalid`, name: 'Auth Probe', emailVerified: true,
      }, { method: 'oauth', oauth: { providerId: 'discord' } });
      const session = await context.internalAdapter.createSession(user.id);
      const cookie = `better-auth.session_token=${await signCookieValue(session.token)}`;
      return Response.json({ userId: user.id, cookie });
    }
    if (pathname === '/__probe/counts') {
      const counts = await env.DB.prepare(
        `SELECT (SELECT count(*) FROM "user") AS users, (SELECT count(*) FROM "session") AS sessions,
                (SELECT count(*) FROM "verification") AS verifications`).first();
      return Response.json(counts);
    }
    if (pathname.startsWith('/api/auth/')) {
      try { return await auth.handler(request); }
      catch (error) {
        return isAPIError(error) ? Response.json({ code: error.body?.code }, { status: error.statusCode })
          : Response.json({ code: 'unavailable' }, { status: 503 });
      }
    }
    return new Response('auth probe', { status: 404 });
  },
} satisfies ExportedHandler<ProbeEnv>;
