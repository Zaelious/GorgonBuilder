// @vitest-environment node
/**
 * T0020: the browser-side account client (src/features/account/api.ts) against the real T0019
 * Worker router and native local D1 (workerd via Wrangler). Sessions are created directly
 * through Better Auth's adapter to stand in for a completed OAuth consent (not genuine OAuth).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BuildDatabase } from '../src/persistence/remote/d1';
import { buildFixture } from '../src/persistence/remote/testing/fixtures';
import { ApiError, createAccountApi, type FetchLike } from '../src/features/account/api';
import { documentHash } from '../src/features/sharing/workspace';
import { accountConfig, type AccountEnv } from './auth/runtime';
import { handleApiRequest } from './api/router';
import { GAME_DATA_VERSION } from './api/game-policy';
import { localD1, resetD1 } from './testing/local-d1';

const origin = 'https://gorgonbuilder-staging.zbailouz7.workers.dev';
const secret = crypto.randomUUID() + crypto.randomUUID();
let db: BuildDatabase;
let dispose: () => Promise<void>;
let env: AccountEnv;

async function session(label: string) {
  const config = (await accountConfig(new Request(origin), env))!;
  const ctx = await config.auth.$context;
  const user = await ctx.internalAdapter.createUser({ email: `${label}@example.invalid`, name: `Private ${label}`, emailVerified: true },
    { method: 'oauth', oauth: { providerId: 'google' } });
  const created = await ctx.internalAdapter.createSession(user.id);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(created.token)));
  return `__Secure-better-auth.session_token=${encodeURIComponent(`${created.token}.${btoa(String.fromCharCode(...signature))}`)}`;
}

/** A browser on the canonical origin: cookie jar plus the Origin header browsers add to unsafe requests. */
function browser(cookie = '') {
  const jar = { cookie };
  const fetch: FetchLike = async (path, init = {}) => {
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    if (jar.cookie) headers.set('cookie', jar.cookie);
    if (!['GET', 'HEAD'].includes(method)) headers.set('origin', origin);
    const response = await handleApiRequest(new Request(origin + path, { method, headers, body: init.body ?? null }), env);
    for (const set of response.headers.getSetCookie()) if (/Max-Age=0/i.test(set)) jar.cookie = '';
    return response;
  };
  return { api: createAccountApi(fetch), jar };
}

beforeAll(async () => { ({ db, dispose } = await localD1()); }, 30000);
afterAll(async () => { await dispose?.(); });
beforeEach(async () => {
  await resetD1(db);
  env = { DB: db, APP_ENV: 'staging', BETTER_AUTH_SECRET: secret, DISCORD_CLIENT_ID: 'local-test', DISCORD_CLIENT_SECRET: 'local-test',
    GOOGLE_CLIENT_ID: 'local-test', GOOGLE_CLIENT_SECRET: 'local-test' };
});

describe('frontend client ↔ real Worker + local D1', () => {
  it('detects guest/new/onboarded sessions and disables itself where accounts are not configured', async () => {
    expect(await browser().api.session()).toEqual({ kind: 'guest' });
    const alice = browser(await session('alice'));
    expect(await alice.api.session()).toEqual({ kind: 'user', username: null });
    await expect(alice.api.createBuild({ document: { ...buildFixture(), gameDataVersion: GAME_DATA_VERSION }, title: 'x', publicDescription: '', visibility: 'private' }))
      .rejects.toMatchObject({ status: 403, code: 'username_required' });
    expect(await alice.api.chooseUsername('AliceCow')).toBe('AliceCow');
    expect(await alice.api.session()).toEqual({ kind: 'user', username: 'AliceCow' });
    const production = createAccountApi(async (path, init) => handleApiRequest(new Request(origin + path, init), { APP_ENV: 'production' } as AccountEnv));
    expect(await production.session()).toEqual({ kind: 'disabled' });
  });

  it('runs the whole save/share/copy/revoke journey with server-side privacy', async () => {
    const alice = browser(await session('alice')); await alice.api.chooseUsername('AliceCow');
    const bob = browser(await session('bob')); await bob.api.chooseUsername('BobCow');
    const guest = browser();
    const document = { ...buildFixture(), gameDataVersion: GAME_DATA_VERSION, title: 'Cow/Unarmed', notes: 'PRIVATE_NOTES',
      characterImport: { characterName: 'PRIVATE_CHARACTER' } };

    const created = await alice.api.createBuild({ document, title: 'Cow/Unarmed', publicDescription: 'Stampede tank', visibility: 'private' });
    expect(created).toMatchObject({ visibility: 'private', revision: 1, author: { username: 'AliceCow' } });
    expect(documentHash(created.document)).toBe(documentHash(document)); // owner round trip is exact: no false "unsaved"
    for (const viewer of [guest, bob]) await expect(viewer.api.getBuild(created.id)).rejects.toMatchObject({ status: 404 });

    const edited = { ...document, skillSlotA: { ...document.skillSlotA, level: 99 } };
    const saved = await alice.api.updateBuild(created.id, { expectedRevision: 1, document: edited, title: edited.title });
    expect(saved.revision).toBe(2);
    await expect(alice.api.updateBuild(created.id, { expectedRevision: 1, document })).rejects.toMatchObject({ status: 409 });
    await expect(bob.api.updateBuild(created.id, { expectedRevision: 2, visibility: 'public' })).rejects.toMatchObject({ status: 404 });

    const unlisted = await alice.api.updateBuild(created.id, { expectedRevision: 2, visibility: 'unlisted' });
    expect(documentHash(unlisted.document)).toBe(documentHash(edited)); // metadata change keeps the saved document
    const shared = await guest.api.getBuild(created.id);
    expect(JSON.stringify(shared)).not.toMatch(/PRIVATE_|characterImport/);
    expect(shared.document.skillSlotA.level).toBe(99);
    expect((await guest.api.listAuthorBuilds('AliceCow')).items).toEqual([]);
    await expect(guest.api.copyBuild(created.id)).rejects.toMatchObject({ status: 401 });

    const copy = await bob.api.copyBuild(created.id);
    expect(copy).toMatchObject({ visibility: 'private', revision: 1, author: { username: 'BobCow' } });
    expect(copy.id).not.toBe(created.id);
    expect(copy.document.notes).toBe('');
    expect((await alice.api.getBuild(created.id)).revision).toBe(3);

    await alice.api.updateBuild(created.id, { expectedRevision: 3, visibility: 'public' });
    expect((await guest.api.listAuthorBuilds('AliceCow')).items.map(item => item.id)).toEqual([created.id]);
    await alice.api.updateBuild(created.id, { expectedRevision: 4, visibility: 'private' });
    await expect(guest.api.getBuild(created.id)).rejects.toMatchObject({ status: 404 });
    expect((await guest.api.listAuthorBuilds('AliceCow')).items).toEqual([]);

    expect((await alice.api.listMyBuilds()).items.map(item => item.id)).toEqual([created.id]);
    expect((await bob.api.listMyBuilds()).items.map(item => item.id)).toEqual([copy.id]);
    await expect(alice.api.deleteBuild(created.id, 1)).rejects.toMatchObject({ status: 409 });
    expect(await alice.api.deleteBuild(created.id, 5)).toEqual({ id: created.id });
    expect((await bob.api.getBuild(copy.id)).id).toBe(copy.id); // the copy is independent
  });

  it('sign-out revokes the session; later writes are 401 and the client reports guest', async () => {
    const alice = browser(await session('alice')); await alice.api.chooseUsername('AliceCow');
    await alice.api.signOut();
    expect(alice.jar.cookie).toBe('');
    expect(await alice.api.session()).toEqual({ kind: 'guest' });
    const stale = browser((await session('carol')));
    await stale.api.chooseUsername('Carol');
    await db.prepare('DELETE FROM session').run();
    await expect(stale.api.listMyBuilds()).rejects.toBeInstanceOf(ApiError);
    expect(await stale.api.session()).toEqual({ kind: 'guest' });
  });

  it('a cancelled/failed provider return goes back to the same SPA page with ?signin=failed', async () => {
    const start = await handleApiRequest(new Request(`${origin}/api/auth/sign-in/social`, { method: 'POST',
      headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'google', callbackURL: '/builds/abcdefghijklmnop' }) }), env);
    const { url } = await start.json() as { url: string };
    const state = new URL(url).searchParams.get('state')!;
    const cookie = start.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const back = await handleApiRequest(new Request(`${origin}/api/auth/callback/google?error=access_denied&state=${encodeURIComponent(state)}`, { headers: { cookie } }), env);
    expect(back.status).toBe(302);
    const location = new URL(back.headers.get('location')!, origin);
    expect(location.origin).toBe(origin);
    expect(location.pathname).toBe('/builds/abcdefghijklmnop');
    expect(location.searchParams.get('signin')).toBe('failed');
    expect(location.searchParams.get('error')).toBe('access_denied');
  });
});
