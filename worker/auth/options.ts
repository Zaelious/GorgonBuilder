import type { BetterAuthOptions } from 'better-auth';

export interface AuthConfig {
  /** A D1 binding (Worker) or a node:sqlite DatabaseSync (schema test). */
  database: NonNullable<BetterAuthOptions['database']>;
  /** Canonical HTTPS origin in staging/production; http://127.0.0.1 only for local probes. */
  baseURL: string;
  /** From a Wrangler secret (BETTER_AUTH_SECRET) in T0019; unique per environment. */
  secret: string;
  /** Provider credentials come from Wrangler secrets in T0019; never client-visible. */
  discord: { clientId: string; clientSecret: string };
  google: { clientId: string; clientSecret: string };
}

export function createAuthOptions(config: AuthConfig) {
  return {
    database: config.database,
    baseURL: config.baseURL,
    basePath: '/api/auth',
    secret: config.secret,
    // Only the canonical origin may initiate state-changing auth requests (CSRF/origin check).
    trustedOrigins: [new URL(config.baseURL).origin],
    telemetry: { enabled: false },
    logger: { disabled: true },
    // Propagate failures to our safe API boundary. better-call otherwise prints raw errors
    // even with the Better Auth logger disabled (including database/provider failures).
    onAPIError: { throw: true, errorURL: '/api/auth/error' },
    // The Worker enforces a shared, atomic D1 limiter before auth mutations and callbacks.
    rateLimit: { enabled: false },
    // No password database: OAuth only unless a verified-email/reset design is approved later.
    emailAndPassword: { enabled: false },
    databaseHooks: {
      user: { create: { before: async user => {
        // No invented email, unverified-email signup, password or caller-supplied identity.
        if (!user.email || !user.emailVerified) return false;
        return { data: user };
      } } },
    },
    socialProviders: {
      discord: { ...config.discord },
      google: { ...config.google },
    },
    account: {
      // Provider tokens are not needed after sign-in; encrypt them at rest if stored.
      encryptOAuthTokens: true,
      accountLinking: { enabled: false, disableImplicitLinking: true },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      // __Secure- prefix + Secure attribute whenever the origin is HTTPS.
      useSecureCookies: config.baseURL.startsWith('https://'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' as const, path: '/' },
    },
  } satisfies BetterAuthOptions;
}
