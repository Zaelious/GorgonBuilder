/**
 * T0020 same-origin client for the T0019 account/build API. Pure fetch wrapper: no React, no
 * storage, no tokens. Session cookies are HttpOnly and handled by the browser only.
 */
import type { BuildDocument } from '../../core/build/document';

export type Visibility = 'private' | 'unlisted' | 'public';
export type Provider = 'discord' | 'google';
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface BuildSummary {
  id: string;
  visibility: Visibility;
  title: string;
  publicDescription: string;
  skillAId: string | null;
  skillBId: string | null;
  schemaVersion: 1;
  gameDataVersion: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  author: { username: string } | null;
}
export interface BuildRecord extends BuildSummary { document: BuildDocument }
export interface BuildPage { items: BuildSummary[]; nextCursor: string | null }

/**
 * - `disabled`: this deployment has no account backend (production, PR previews, plain Vite).
 *   Account controls are hidden and the guest planner is unchanged.
 * - `unavailable`: accounts are configured but the service failed; offer retry, keep planning.
 */
export type SessionState =
  | { kind: 'disabled' }
  | { kind: 'unavailable' }
  | { kind: 'guest' }
  | { kind: 'user'; username: string | null };

export interface CreateBuildInput { document: BuildDocument; title: string; publicDescription: string; visibility: Visibility }
export interface UpdateBuildInput {
  expectedRevision: number;
  document?: BuildDocument;
  title?: string;
  publicDescription?: string;
  visibility?: Visibility;
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

const BUILD_ID = /^[A-Za-z0-9_-]{16}$/;
export function isBuildId(value: string): boolean { return BUILD_ID.test(value); }

function isJson(response: Response): boolean {
  return response.headers.get('content-type')?.toLowerCase().includes('application/json') ?? false;
}

async function body(response: Response): Promise<unknown> {
  if (!isJson(response)) return null;
  try { return await response.json() as unknown; } catch { return null; }
}

function errorCode(value: unknown): { code: string; message: string } | null {
  if (!value || typeof value !== 'object') return null;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return typeof code === 'string' ? { code, message: typeof message === 'string' ? message : '' } : null;
}

export function createAccountApi(fetchImpl: FetchLike = (input, init) => fetch(input, init)) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(path, {
        ...init,
        credentials: 'same-origin',
        headers: { accept: 'application/json', ...(init.body === undefined ? {} : { 'content-type': 'application/json' }) },
      });
    } catch {
      throw new ApiError(0, 'network', 'Network request failed.');
    }
    const parsed = await body(response);
    if (!response.ok) {
      const failure = errorCode(parsed);
      throw new ApiError(response.status, failure?.code ?? (isJson(response) ? 'unknown' : 'not_json'), failure?.message ?? '');
    }
    if (!isJson(response)) throw new ApiError(response.status, 'not_json', 'Unexpected response.');
    return parsed as T;
  }
  const json = (method: string, value: unknown): RequestInit => ({ method, body: JSON.stringify(value) });
  const page = (path: string, cursor: string | null, limit: number) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return request<BuildPage>(`${path}?${params.toString()}`);
  };

  return {
    /** Feature detection plus session: never throws. */
    async session(): Promise<SessionState> {
      try {
        const value = await request<{ authenticated?: unknown; profile?: { username?: unknown } | null }>('/api/auth/get-session');
        if (value.authenticated === false) return { kind: 'guest' };
        if (value.authenticated !== true) return { kind: 'disabled' };
        const username = typeof value.profile?.username === 'string' ? value.profile.username : null;
        return { kind: 'user', username };
      } catch (error) {
        // Only a configured deployment's own JSON failure means "temporarily unavailable".
        // Missing routes, HTML fallbacks, `not_configured` and network errors disable accounts.
        if (error instanceof ApiError && error.status >= 500 && error.code !== 'not_configured' && error.code !== 'not_json') {
          return { kind: 'unavailable' };
        }
        return { kind: 'disabled' };
      }
    },
    /** Returns the provider URL to navigate to. `returnTo` is a same-origin path. */
    async signIn(provider: Provider, returnTo: string): Promise<string> {
      const value = await request<{ url?: unknown }>('/api/auth/sign-in/social', json('POST', { provider, callbackURL: returnTo }));
      if (typeof value.url !== 'string' || !/^https:\/\//.test(value.url)) throw new ApiError(502, 'invalid_redirect', 'Sign-in did not return a provider page.');
      return value.url;
    },
    signOut: () => request<unknown>('/api/auth/sign-out', json('POST', {})),
    async chooseUsername(username: string): Promise<string> {
      const value = await request<{ profile?: { username?: unknown } }>('/api/me/username', json('PUT', { username }));
      return typeof value.profile?.username === 'string' ? value.profile.username : username;
    },
    createBuild: (input: CreateBuildInput) => request<BuildRecord>('/api/builds', json('POST', input)),
    getBuild: (id: string) => request<BuildRecord>(`/api/builds/${encodeURIComponent(id)}`),
    updateBuild: (id: string, input: UpdateBuildInput) => request<BuildRecord>(`/api/builds/${encodeURIComponent(id)}`, json('PATCH', input)),
    deleteBuild: (id: string, expectedRevision: number) => request<{ id: string }>(`/api/builds/${encodeURIComponent(id)}`, json('DELETE', { expectedRevision })),
    copyBuild: (id: string, title?: string) => request<BuildRecord>(`/api/builds/${encodeURIComponent(id)}/copy`, json('POST', title === undefined ? {} : { title })),
    listMyBuilds: (cursor: string | null = null, limit = 50) => page('/api/me/builds', cursor, limit),
    listAuthorBuilds: (username: string, cursor: string | null = null, limit = 50) => page(`/api/users/${encodeURIComponent(username)}/builds`, cursor, limit),
  };
}
export type AccountApi = ReturnType<typeof createAccountApi>;

/** Plain-language, actionable explanation. Never echoes server internals or request data. */
export function describeApiError(error: unknown, action = 'complete this action'): string {
  if (!(error instanceof ApiError)) return `Could not ${action}. Try again.`;
  switch (error.status) {
    case 0: return `Could not ${action}: you appear to be offline. Your work is still saved in this browser; try again when connected.`;
    case 401: return 'Your sign-in has ended. Sign in again to continue — your work is still saved in this browser.';
    case 403:
      if (error.code === 'username_required') return 'Choose a username before saving builds.';
      if (error.code === 'invalid_origin') return 'This action must be performed from the GorgonBuilder site itself. Reload the page and try again.';
      return 'Only the owner of this build can change it.';
    case 404: return 'This build is not available. It may be private, deleted, or the link may be wrong.';
    case 409: return error.code === 'username_conflict'
      ? 'That username is already taken (or your account already has one). Try a different name.'
      : 'This build was changed somewhere else (another tab or device) since you opened it.';
    case 413: return 'This build is too large to save (limit 256 KB). Remove some items or mods and try again.';
    case 422: return error.message ? `The server rejected this save: ${error.message}` : 'The build or its details are not valid for saving.';
    case 429: return 'Too many requests. Wait one minute, then try again.';
    default: return error.status >= 500
      ? `The account service is temporarily unavailable, so we could not ${action}. Your work is still saved in this browser; try again shortly.`
      : `Could not ${action}. Try again.`;
  }
}
