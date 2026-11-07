// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { betterAuth } from 'better-auth';
import type { BuildDatabase } from '../../src/persistence/remote/d1';
import { buildFixture as contractFixture } from '../../src/persistence/remote/testing/fixtures';
import { validateBuildDocument } from '../../src/core/build/validation';
import { publicDocument } from '../../src/persistence/remote/public-document';
import { createAuthOptions } from '../auth/options';
import { accountConfig, type AccountEnv } from '../auth/runtime';
import { localD1, resetD1 } from '../testing/local-d1';
import { handleApiRequest } from './router';
import { COMBAT_SKILL_IDS, GAME_DATA_VERSION } from './game-policy';
import { enforceRateLimit } from './security';

const buildFixture = (...args: Parameters<typeof contractFixture>) => ({ ...contractFixture(...args), gameDataVersion: GAME_DATA_VERSION });
const origin = 'https://gorgonbuilder-staging.zbailouz7.workers.dev';
// Generated at runtime, never a deployed or tracked signing secret.
const secret = crypto.randomUUID() + crypto.randomUUID();
let db: BuildDatabase;
let dispose: () => Promise<void>;
let env: AccountEnv;
let alice: { id: string; cookie: string };
let bob: { id: string; cookie: string };
async function account(label: string) {
  const config = (await accountConfig(new Request(origin), env))!;
  const ctx = await config.auth.$context;
  const user = await ctx.internalAdapter.createUser({ email: `${label}@example.invalid`, name: `Private ${label}`, emailVerified: true },
    { method: 'oauth', oauth: { providerId: 'discord' } });
  const session = await ctx.internalAdapter.createSession(user.id);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(session.token)));
  return { id: user.id, cookie: `__Secure-better-auth.session_token=${encodeURIComponent(`${session.token}.${btoa(String.fromCharCode(...signature))}`)}` };
}
async function call(path: string, method = 'GET', body?: unknown, cookie = '', overrides: Record<string, string> = {}) {
  const headers: Record<string, string> = { cookie, ...(['GET', 'HEAD'].includes(method) ? {} : { origin, 'content-type': 'application/json' }), ...overrides };
  if (headers.origin === '') delete headers.origin;
  const response = await handleApiRequest(new Request(origin + path, { method, headers,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }), env);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.has('access-control-allow-origin')).toBe(false);
  const text = await response.text();
  return { response, text, body: text ? JSON.parse(text) as Record<string, unknown> : {} };
}
async function create(visibility = 'private', cookie = alice.cookie) {
  const doc = buildFixture();
  doc.characterImport = { characterName: 'PRIVATE_CHARACTER', server: 'PRIVATE_SERVER', metadata: { secret: 'PRIVATE_REPORT' } };
  const item = doc.equipment[1]!.item;
  if (item.kind !== 'database') {
    item.instance.displayName = 'PRIVATE_CUSTOM_NAME';
    item.instance.metadata = { sourceItem: { Owner: 'PRIVATE_OWNER', Storage: 'PRIVATE_LOCATION' } };
  }
  const result = await call('/api/builds', 'POST', { document: doc, visibility }, cookie);
  expect(result.response.status).toBe(201);
  return { id: String(result.body.id), doc, result };
}
beforeAll(async () => { ({ db, dispose } = await localD1()); }, 30000);
afterAll(async () => { await dispose?.(); });
beforeEach(async () => {
  await resetD1(db);
  env = { DB: db, APP_ENV: 'staging', BETTER_AUTH_SECRET: secret, DISCORD_CLIENT_ID: 'local-test', DISCORD_CLIENT_SECRET: 'local-test',
    GOOGLE_CLIENT_ID: 'local-test', GOOGLE_CLIENT_SECRET: 'local-test' };
  alice = await account('alice'); bob = await account('bob');
  expect((await call('/api/me/username', 'PUT', { username: 'AliceCow' }, alice.cookie)).response.status).toBe(200);
  expect((await call('/api/me/username', 'PUT', { username: 'BobCow' }, bob.cookie)).response.status).toBe(200);
});

describe('real local D1 API authorization: owner, second account, anonymous', () => {
  it.each(['private', 'unlisted', 'public'])('%s access matrix and exact owner document', async visibility => {
    const { id, doc } = await create(visibility);
    expect((await call(`/api/builds/${id}`, 'GET', undefined, alice.cookie)).body.document).toEqual(doc);
    for (const cookie of [bob.cookie, '']) {
      const read = await call(`/api/builds/${id}`, 'GET', undefined, cookie);
      expect(read.response.status).toBe(visibility === 'private' ? 404 : 200);
      if (visibility !== 'private') {
        expect(read.body.document).toEqual(publicDocument(doc));
        expect(read.text).not.toMatch(/PRIVATE_|characterImport|instanceId|provenance|sourceItem|ownerUserId|providerId|email|token/);
        expect(validateBuildDocument(read.body.document).ok).toBe(true);
      }
      for (const method of ['PATCH', 'DELETE']) {
        const mutate = await call(`/api/builds/${id}`, method, { expectedRevision: 1, ...(method === 'PATCH' ? { title: 'Intrusion' } : {}) }, cookie);
        expect(mutate.response.status).toBe(!cookie ? 401 : visibility === 'private' ? 404 : 403);
      }
      const copy = await call(`/api/builds/${id}/copy`, 'POST', {}, cookie);
      expect(copy.response.status).toBe(!cookie ? 401 : visibility === 'private' ? 404 : 201);
      if (copy.response.status === 201) {
        expect(copy.body).toMatchObject({ visibility: 'private', revision: 1, document: publicDocument(doc) });
        expect(copy.text).not.toMatch(/PRIVATE_|sourceItem|ownerUserId/);
        expect(copy.body.id).not.toBe(id);
        expect((await call(`/api/builds/${copy.body.id}`, 'GET', undefined, alice.cookie)).response.status).toBe(404);
      }
    }
  });
  it('revokes all outsider reads/listings immediately and keeps all own visibilities', async () => {
    await create('private'); await create('unlisted');
    const { id } = await create('public');
    for (const cookie of ['', bob.cookie, alice.cookie]) {
      const listed = await call('/api/users/alicecow/builds', 'GET', undefined, cookie);
      expect(listed.body.items).toHaveLength(1);
      expect(listed.text).not.toMatch(/ownerUserId|PRIVATE_|document/);
    }
    expect((await call('/api/me/builds', 'GET', undefined, alice.cookie)).body.items).toHaveLength(3);
    expect((await call('/api/me/builds', 'GET', undefined, bob.cookie)).body.items).toHaveLength(0);
    expect((await call(`/api/builds/${id}`, 'PATCH', { expectedRevision: 1, visibility: 'private' }, alice.cookie)).response.status).toBe(200);
    expect((await call(`/api/builds/${id}`, 'GET')).response.status).toBe(404);
    expect((await call(`/api/builds/${id}`, 'GET', undefined, bob.cookie)).response.status).toBe(404);
    expect((await call('/api/users/AliceCow/builds')).body.items).toEqual([]);
  });
  it('copies are independent and stale revisions fail for owner edit and delete', async () => {
    const { id } = await create('public');
    const copied = await call(`/api/builds/${id}/copy`, 'POST', {}, bob.cookie);
    const copyId = String(copied.body.id);
    expect((await call(`/api/builds/${id}`, 'PATCH', { expectedRevision: 1, document: buildFixture('Psychology') }, alice.cookie)).response.status).toBe(200);
    expect((await call(`/api/builds/${copyId}`, 'GET', undefined, bob.cookie)).body.document).toEqual(copied.body.document);
    for (const method of ['PATCH', 'DELETE']) expect((await call(`/api/builds/${id}`, method,
      { expectedRevision: 1, ...(method === 'PATCH' ? { title: 'stale' } : {}) }, alice.cookie)).response.status).toBe(409);
    expect((await call(`/api/builds/${id}`, 'DELETE', { expectedRevision: 2 }, alice.cookie)).response.status).toBe(200);
    expect((await call(`/api/builds/${id}`, 'GET', undefined, alice.cookie)).response.status).toBe(404);
  });
  it('deletes an account only with explicit confirmation and a fresh verified session; cascades every owned record', async () => {
    await create('public');
    expect((await call('/api/me', 'DELETE', {}, alice.cookie)).response.status).toBe(400);
    await db.prepare('UPDATE session SET createdAt=? WHERE userId=?').bind(Date.now() - 11 * 60 * 1000, alice.id).run();
    expect((await call('/api/me', 'DELETE', { confirmation: 'delete my account' }, alice.cookie)).response.status).toBe(403);
    await db.prepare('UPDATE session SET createdAt=? WHERE userId=?').bind(Date.now(), alice.id).run();
    const deleted = await call('/api/me', 'DELETE', { confirmation: 'delete my account' }, alice.cookie);
    expect(deleted.response.status).toBe(200);
    expect(deleted.response.headers.get('set-cookie')).toMatch(/Max-Age=0/i);
    expect((await call('/api/me', 'GET', undefined, alice.cookie)).response.status).toBe(401);
    for (const [table, key] of [['build', 'owner_user_id'], ['profile', 'user_id'], ['session', 'userId'], ['account', 'userId']]) {
      expect(await db.prepare(`SELECT count(*) AS n FROM "${table}" WHERE "${key}"=?`).bind(alice.id).first()).toEqual({ n: 0 });
    }
    expect((await call('/api/me', 'GET', undefined, bob.cookie)).response.status).toBe(200);
  });
  it('forged identities, missing/tampered/expired sessions never establish ownership', async () => {
    const { id } = await create();
    for (const cookie of ['', `userId=${alice.id}`, `${alice.cookie}tampered`]) {
      expect((await call('/api/me/builds', 'GET', undefined, cookie, { 'x-user-id': alice.id })).response.status).toBe(401);
      expect((await call(`/api/builds/${id}`, 'GET', undefined, cookie)).response.status).toBe(404);
    }
    await db.prepare('UPDATE session SET expiresAt=? WHERE userId=?').bind(Date.now() - 1000, alice.id).run();
    expect((await call('/api/me', 'GET', undefined, alice.cookie)).response.status).toBe(401);
    expect((await call('/api/builds', 'POST', { document: buildFixture() }, alice.cookie)).response.status).toBe(401);
  });
});

describe('onboarding, payloads and request security', () => {
  it('requires a username, rejects duplicate/case/reserved handles, and atomically claims a handle', async () => {
    const charlie = await account('charlie');
    expect((await call('/api/me', 'GET', undefined, charlie.cookie)).body).toEqual({ authenticated: true, profile: null, needsUsername: true });
    expect((await call('/api/builds', 'POST', { document: buildFixture() }, charlie.cookie)).response.status).toBe(403);
    expect((await call('/api/me/username', 'PUT', { username: 'aLiCeCoW' }, charlie.cookie)).response.status).toBe(409);
    expect((await call('/api/me/username', 'PUT', { username: 'Ad-min' }, charlie.cookie)).response.status).toBe(422);
    const dana = await account('dana');
    const claims = await Promise.all([call('/api/me/username', 'PUT', { username: 'NewCow' }, charlie.cookie),
      call('/api/me/username', 'PUT', { username: 'newcow' }, dana.cookie)]);
    expect(claims.map(c => c.response.status).sort()).toEqual([200, 409]);
  });
  it('rejects cross-site/no-Origin, simple forms, invalid JSON, malformed IDs, injected owners and indexes', async () => {
    for (const originHeader of ['https://evil.example', '', 'null']) {
      expect((await call('/api/builds', 'POST', { document: buildFixture() }, alice.cookie, { origin: originHeader })).response.status).toBe(403);
      expect((await call('/api/auth/sign-out', 'POST', {}, alice.cookie, { origin: originHeader })).response.status).toBe(403);
    }
    expect((await call('/api/builds', 'POST', '{}', alice.cookie, { 'content-type': 'text/plain' })).response.status).toBe(415);
    expect((await call('/api/builds', 'POST', '{invalid', alice.cookie)).response.status).toBe(400);
    for (const extra of [{ ownerUserId: bob.id }, { skillAId: 'Cow' }, { userId: bob.id }]) {
      expect((await call('/api/builds', 'POST', { document: buildFixture(), ...extra }, alice.cookie)).response.status).toBe(400);
    }
    expect((await call('/api/builds', 'POST', { document: { ...buildFixture(), ownerUserId: bob.id } }, alice.cookie)).response.status).toBe(422);
    for (const path of ['/api/builds/short', '/api/builds/search', '/api/builds/%27OR%201=1--', '/api/auth/sign-up/email', '/__probe/session']) {
      expect((await call(path)).response.status).toBe(404);
    }
    expect((await call('/api/builds', 'GET')).response.status).toBe(405);
    expect((await call('/api/me/builds?limit=51', 'GET', undefined, alice.cookie)).response.status).toBe(400);
    expect((await call('/api/me/builds?cursor=bad', 'GET', undefined, alice.cookie)).response.status).toBe(400);
  });
  it('bounds request bytes BEFORE JSON parsing and validates document/version/metadata/raw reports', async () => {
    expect((await call('/api/builds', 'POST', 'x'.repeat(280 * 1024), alice.cookie)).response.status).toBe(413);
    expect((await call('/api/builds', 'POST', '{', alice.cookie, { 'content-length': String(280 * 1024) })).response.status).toBe(413);
    for (const doc of [{ ...buildFixture(), schemaVersion: 2 }, { ...buildFixture(), gameDataVersion: '491' },
      buildFixture('Alchemy'), JSON.parse(readFileSync('src/core/import/fixtures/character-sheet.json', 'utf8'))]) {
      expect((await call('/api/builds', 'POST', { document: doc }, alice.cookie)).response.status).toBe(422);
    }
    expect((await call('/api/builds', 'POST', { document: { ...buildFixture(), notes: 'x'.repeat(256 * 1024) } }, alice.cookie)).response.status).toBe(413);
    expect((await call('/api/builds', 'POST', { document: buildFixture(), title: 'x'.repeat(121) }, alice.cookie)).response.status).toBe(422);
  });
  it('enforces an atomic shared limiter under concurrency, expiry, and HTTP 429/Retry-After', async () => {
    const outcomes = await Promise.allSettled(Array.from({ length: 12 }, () => enforceRateLimit(db, 'test', 'sensitive-ip', 3, 120000)));
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(3);
    await expect(enforceRateLimit(db, 'test', 'sensitive-ip', 3, 180000)).resolves.toBeUndefined();
    expect(JSON.stringify((await db.prepare('SELECT key FROM api_rate_limit').all()).results)).not.toContain('sensitive-ip');
    for (let i = 0; i < 5; i++) await call('/api/me/username', 'PUT', { username: 'BobCow' }, bob.cookie);
    const limited = await call('/api/me/username', 'PUT', { username: 'BobCow' }, bob.cookie);
    expect(limited.response.status).toBe(429); expect(limited.response.headers.get('retry-after')).toBe('60');
  });
  it('returns a safe 503 without logging database/provider details', async () => {
    const logs = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const broken = { ...env, DB: { prepare: () => { throw new Error('PRIVATE_SQL_AND_TOKEN'); }, batch: db.batch.bind(db) } };
      const response = await handleApiRequest(new Request(origin + '/api/builds', { method: 'POST',
        headers: { origin, cookie: alice.cookie, 'content-type': 'application/json' }, body: '{}' }), broken);
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain('PRIVATE_SQL_AND_TOKEN');
      expect(logs).not.toHaveBeenCalled();
    } finally { logs.mockRestore(); }
  });
  it('does not touch inherited bindings at preview hosts or when production is unconfigured', async () => {
    const prepare = vi.fn(() => { throw new Error('Binding must not be touched'); });
    for (const variant of [{ APP_ENV: 'preview', host: origin }, { APP_ENV: 'staging', host: 'https://pr-gorgonbuilder.example' },
      { APP_ENV: 'production', host: 'https://pr-gorgonbuilder.zbailouz7.workers.dev' }]) {
      const blockedEnv = { ...env, APP_ENV: variant.APP_ENV, DB: { prepare } };
      for (const path of ['/api/health', '/api/me', '/api/auth/sign-in/social', '/api/builds/AAAAAAAAAAAAAAAA']) {
        const response = await handleApiRequest(new Request(variant.host + path, { headers: { cookie: alice.cookie } }), blockedEnv);
        expect([405, 503]).toContain(response.status);
      }
    }
    expect(prepare).not.toHaveBeenCalled();
    const missing = await handleApiRequest(new Request('https://gorgonbuilder.zbailouz7.workers.dev/api/me'), { APP_ENV: 'production' });
    expect(missing.status).toBe(503);
  });
});

describe('real Better Auth handlers (local provider initiation, not genuine OAuth)', () => {
  it('uses pinned provider policy and only verified-email signup; combat allowlist matches shipped data', async () => {
    const config = (await accountConfig(new Request(origin), env))!;
    expect(config.auth.options.account?.accountLinking).toMatchObject({ enabled: false, disableImplicitLinking: true });
    const before = config.auth.options.databaseHooks!.user!.create!.before!;
    expect(await before({ id: 'x', name: 'x', email: 'unverified@example.invalid', emailVerified: false, createdAt: new Date(), updatedAt: new Date() })).toBe(false);
    const data = JSON.parse(gunzipSync(readFileSync('src/generated/game-data/progression.json.gz')).toString()) as { gameDataVersion: string; skills: { id: string; combat: boolean }[] };
    expect(GAME_DATA_VERSION).toBe(data.gameDataVersion);
    expect(COMBAT_SKILL_IDS).toEqual(data.skills.filter(s => s.combat).map(s => s.id));
    const schemaOptions = createAuthOptions({ database: db as never, baseURL: origin, secret,
      discord: { clientId: 'local', clientSecret: 'local' }, google: { clientId: 'local', clientSecret: 'local' } });
    expect(betterAuth(schemaOptions).options.emailAndPassword?.enabled).toBe(false);
  });
  it('initiates both providers with secure host-only state cookies and rejects unsafe callbacks/id tokens', async () => {
    for (const provider of ['discord', 'google']) {
      const start = await call('/api/auth/sign-in/social', 'POST', { provider, callbackURL: '/' });
      expect(start.response.status).toBe(200);
      expect(String(start.body.url)).toContain(encodeURIComponent(`${origin}/api/auth/callback/${provider}`));
      const cookie = start.response.headers.get('set-cookie')!;
      expect(cookie).toMatch(/HttpOnly/); expect(cookie).toMatch(/Secure/); expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).not.toMatch(/Domain=/i);
    }
    for (const body of [{ provider: 'discord', callbackURL: 'https://evil.example' }, { provider: 'discord', idToken: { token: 'forged' } }, { provider: 'github' }, { provider: 'google', callbackURL: 'http://[' }]) {
      expect((await call('/api/auth/sign-in/social', 'POST', body)).response.status).toBe(400);
    }
    const error = await call('/api/auth/error?error=email-not-found');
    expect(error.text).toMatch(/Google/); expect(error.text).not.toMatch(/email-not-found/);
  });
  it('completes a mocked Discord callback, rejects email collisions/missing or unverified email and invalid state', async () => {
    // Network responses are local fixtures. This proves callback plumbing and account policy,
    // not real provider credentials, consent or production CPU time.
    const config = (await accountConfig(new Request(origin), env))!;
    const context = await config.auth.$context;
    const provider = context.socialProviders.find(p => p.id === 'discord')!;
    let providerProfile = { id: '123456789', email: 'new-provider@example.invalid' as string | null, verified: true };
    const exchange = vi.spyOn(provider, 'validateAuthorizationCode').mockResolvedValue({
      accessToken: 'local-fake-provider-token', refreshToken: 'local-fake-refresh', scopes: ['identify', 'email'],
    });
    const info = vi.spyOn(provider, 'getUserInfo').mockImplementation(async () => ({
      user: { name: 'Private provider name', email: providerProfile.email ?? undefined, emailVerified: providerProfile.verified },
      data: providerProfile,
    }) as never);
    async function flow() {
      const start = await config.auth.handler(new Request(origin + '/api/auth/sign-in/social', { method: 'POST',
        headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'discord', callbackURL: '/', errorCallbackURL: '/api/auth/error' }) }));
      const body = await start.json() as { url: string };
      const state = new URL(body.url).searchParams.get('state')!;
      const cookie = start.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
      return { response: await config.auth.handler(new Request(`${origin}/api/auth/callback/discord?code=local-fake-code&state=${encodeURIComponent(state)}`,
        { headers: { cookie } })) };
    }
    try {
      const verified = await flow();
      expect(verified.response.status).toBe(302);
      const signed = verified.response.headers.getSetCookie().filter(c => c.includes('session_token=')).map(c => c.split(';')[0]).join('; ');
      expect(signed).toContain('__Secure-better-auth.session_token=');
      expect((await call('/api/me', 'GET', undefined, signed)).body).toMatchObject({ authenticated: true, needsUsername: true });
      const stored = await db.prepare('SELECT accessToken FROM account').first<{ accessToken: string }>();
      expect(stored?.accessToken).toBeTruthy(); expect(stored?.accessToken).not.toBe('local-fake-provider-token');
      providerProfile = { ...providerProfile, id: '223456789', email: 'alice@example.invalid' };
      const collision = await flow();
      expect(collision.response.headers.get('location')).toContain('/api/auth/error');
      providerProfile = { ...providerProfile, id: '323456789', email: null };
      expect((await flow()).response.headers.get('location')).toContain('/api/auth/error');
      providerProfile = { ...providerProfile, id: '423456789', email: 'unverified@example.invalid', verified: false };
      expect((await flow()).response.headers.get('location')).toContain('/api/auth/error');
      expect(await db.prepare('SELECT count(*) AS n FROM "user"').first()).toEqual({ n: 3 });
      const invalid = await call('/api/auth/callback/discord?code=forged&state=forged');
      expect(invalid.response.status).toBe(302);
      expect(invalid.response.headers.get('location')).toContain('/api/auth/error');
    } finally { exchange.mockRestore(); info.mockRestore(); }
  });
  it('returns a safe session projection and signs out with database revocation', async () => {
    const before = await call('/api/auth/get-session', 'GET', undefined, alice.cookie);
    expect(before.body).toEqual({ authenticated: true, needsUsername: false, profile: { username: 'AliceCow' } });
    expect(before.text).not.toMatch(/email|token|expiresAt|Private|userId/);
    const logout = await call('/api/auth/sign-out', 'POST', {}, alice.cookie);
    expect(logout.response.status).toBe(200);
    expect(logout.response.headers.get('set-cookie')).toMatch(/Max-Age=0/i);
    expect((await call('/api/me', 'GET', undefined, alice.cookie)).response.status).toBe(401);
    expect((await call('/api/auth/get-session', 'GET', undefined, alice.cookie)).body).toEqual({ authenticated: false });
  });
});
