import { betterAuth, type BetterAuthOptions } from 'better-auth';
import type { BuildDatabase } from '../../src/persistence/remote/d1';
import { createAuthOptions } from './options';

export interface AccountEnv {
  DB?: BuildDatabase;
  APP_ENV?: string;
  APP_ORIGIN?: string;
  BETTER_AUTH_SECRET?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

const ORIGINS: Record<string, string> = {
  staging: 'https://gorgonbuilder-staging.zbailouz7.workers.dev',
  production: 'https://gorgonbuilder.zbailouz7.workers.dev',
};
/** Check before touching ANY account binding. Preview URLs and unknown envs fail closed,
 * even if bindings are mistakenly injected. Host/forwarded headers cannot choose the origin.
 */
export function canonicalOrigin(request: Request, env: AccountEnv): string | null {
  const url = new URL(request.url);
  if (env.APP_ENV === 'local') {
    const origin = env.APP_ORIGIN;
    if (!origin || origin !== url.origin || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) return null;
    return origin;
  }
  const expected = ORIGINS[env.APP_ENV ?? ''];
  return expected && url.origin === expected ? expected : null;
}

export async function accountConfig(request: Request, env: AccountEnv) {
  const origin = canonicalOrigin(request, env);
  if (!origin || !env.DB || !env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32
    || !env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  const auth = betterAuth(createAuthOptions({
    database: env.DB as NonNullable<BetterAuthOptions['database']>, baseURL: origin, secret: env.BETTER_AUTH_SECRET,
    discord: { clientId: env.DISCORD_CLIENT_ID, clientSecret: env.DISCORD_CLIENT_SECRET },
    google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
  }));
  // Better Auth initializes asynchronously. Always observe initialization before doing
  // other work, so a failed adapter cannot become an unhandled/logged rejection.
  await auth.$context;
  return { origin, db: env.DB, auth };
}
