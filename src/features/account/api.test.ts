// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createAccountApi, describeApiError, type FetchLike } from './api';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const err = (status: number, code: string, message = '') => json({ error: { code, message } }, status);

describe('feature detection never throws and hides accounts where the backend is absent', () => {
  it.each([
    ['production/preview 503 not_configured', () => err(503, 'not_configured'), 'disabled'],
    ['plain Vite SPA HTML fallback', () => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }), 'disabled'],
    ['older deployment JSON 404', () => err(404, 'not_found'), 'disabled'],
    ['network failure / offline', () => { throw new TypeError('Failed to fetch'); }, 'disabled'],
    ['configured service dependency failure', () => err(503, 'unavailable'), 'unavailable'],
    ['guest', () => json({ authenticated: false }), 'guest'],
  ] as const)('%s', async (_label, respond, kind) => {
    const api = createAccountApi(async () => respond());
    expect((await api.session()).kind).toBe(kind);
  });
  it('reports the onboarded username, or null while a username is still needed', async () => {
    expect(await createAccountApi(async () => json({ authenticated: true, profile: { username: 'CowFan' }, needsUsername: false })).session()).toEqual({ kind: 'user', username: 'CowFan' });
    expect(await createAccountApi(async () => json({ authenticated: true, profile: null, needsUsername: true })).session()).toEqual({ kind: 'user', username: null });
  });
});

describe('requests', () => {
  it('sends same-origin JSON with credentials and no tokens, and parses build records', async () => {
    const fetch = vi.fn<FetchLike>(async () => json({ id: 'abcdefghijklmnop', revision: 2 }, 201));
    const api = createAccountApi(fetch);
    await api.updateBuild('abcdefghijklmnop', { expectedRevision: 1, visibility: 'public' });
    const [path, init] = fetch.mock.calls[0]!;
    expect(path).toBe('/api/builds/abcdefghijklmnop');
    expect(init).toMatchObject({ method: 'PATCH', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' } });
    expect(JSON.parse(init!.body as string)).toEqual({ expectedRevision: 1, visibility: 'public' });
    expect(JSON.stringify(init)).not.toMatch(/token|cookie|authorization/i);
  });
  it('builds bounded page and author URLs', async () => {
    const fetch = vi.fn<FetchLike>(async () => json({ items: [], nextCursor: null }));
    const api = createAccountApi(fetch);
    await api.listMyBuilds('abc.def');
    await api.listAuthorBuilds('Cow Fan');
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['/api/me/builds?limit=50&cursor=abc.def', '/api/users/Cow%20Fan/builds?limit=50']);
  });
  it('sign-in returns only an HTTPS provider URL and posts the same-origin return path', async () => {
    const fetch = vi.fn<FetchLike>(async () => json({ url: 'https://accounts.google.com/o/oauth2?state=x', redirect: true }));
    expect(await createAccountApi(fetch).signIn('google', '/builds/abcdefghijklmnop')).toBe('https://accounts.google.com/o/oauth2?state=x');
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual({ provider: 'google', callbackURL: '/builds/abcdefghijklmnop' });
    await expect(createAccountApi(async () => json({ url: 'javascript:alert(1)' })).signIn('discord', '/')).rejects.toBeInstanceOf(ApiError);
  });
  it('raises ApiError with status and code; HTML or network failures are distinguishable', async () => {
    await expect(createAccountApi(async () => err(409, 'revision_conflict')).getBuild('abcdefghijklmnop')).rejects.toMatchObject({ status: 409, code: 'revision_conflict' });
    await expect(createAccountApi(async () => new Response('x', { status: 502, headers: { 'content-type': 'text/html' } })).getBuild('a')).rejects.toMatchObject({ status: 502, code: 'not_json' });
    await expect(createAccountApi(async () => { throw new TypeError('offline'); }).getBuild('a')).rejects.toMatchObject({ status: 0, code: 'network' });
  });
});

describe('plain-language errors', () => {
  it.each([
    [new ApiError(0, 'network', ''), /offline.*still saved in this browser/],
    [new ApiError(401, 'unauthenticated', ''), /sign-in has ended.*still saved/i],
    [new ApiError(403, 'username_required', ''), /username/],
    [new ApiError(403, 'forbidden', ''), /Only the owner/],
    [new ApiError(404, 'not_found', ''), /not available/],
    [new ApiError(409, 'revision_conflict', ''), /changed somewhere else/],
    [new ApiError(409, 'username_conflict', ''), /already taken/],
    [new ApiError(413, 'payload_too_large', ''), /too large/],
    [new ApiError(422, 'invalid_metadata', 'Title must be at most 120 characters.'), /Title must be at most 120/],
    [new ApiError(429, 'rate_limited', ''), /one minute/],
    [new ApiError(503, 'unavailable', ''), /temporarily unavailable.*still saved/],
  ])('%#', (error, message) => { expect(describeApiError(error, 'save the build')).toMatch(message); });
});
