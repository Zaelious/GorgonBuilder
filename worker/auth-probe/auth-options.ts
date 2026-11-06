/**
 * T0018 AUTH FEASIBILITY ONLY — not mounted by the production Worker (worker/index.ts).
 *
 * The Better Auth option set that T0019 is expected to adopt: Discord + Google OAuth only,
 * no email/password, `/api/auth` on the same origin as the SPA, D1 passed natively.
 * Migration 0001 is generated from exactly these options (see auth-schema.test.ts).
 */
import type { BetterAuthOptions } from 'better-auth';

export interface ProbeAuthConfig {
  /** A D1 binding (Worker) or a node:sqlite DatabaseSync (schema test). */
  database: NonNullable<BetterAuthOptions['database']>;
  /** Canonical HTTPS origin in staging/production; http://127.0.0.1 only for local probes. */
  baseURL: string;
  /** From a Wrangler secret (BETTER_AUTH_SECRET) in T0019; probe-only constant locally. */
  secret: string;
  /** Provider credentials come from Wrangler secrets in T0019; probes use inert placeholders. */
  discord: { clientId: string; clientSecret: string };
  google: { clientId: string; clientSecret: string };
}

export function createAuthOptions(config: ProbeAuthConfig) {
  return {
    database: config.database,
    baseURL: config.baseURL,
    basePath: '/api/auth',
    secret: config.secret,
    // Only the canonical origin may initiate state-changing auth requests (CSRF/origin check).
    trustedOrigins: [new URL(config.baseURL).origin],
    telemetry: { enabled: false },
    // No password database: OAuth only unless a verified-email/reset design is approved later.
    emailAndPassword: { enabled: false },
    socialProviders: {
      discord: { ...config.discord },
      google: { ...config.google },
    },
    account: {
      // Provider tokens are not needed after sign-in; encrypt them at rest if stored.
      encryptOAuthTokens: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      // __Secure- prefix + Secure attribute whenever the origin is HTTPS.
      useSecureCookies: config.baseURL.startsWith('https://'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' as const, path: '/' },
    },
  } satisfies BetterAuthOptions;
}
