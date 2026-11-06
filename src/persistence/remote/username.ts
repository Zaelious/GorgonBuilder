/**
 * Public GorgonBuilder handles (T0018 contract; enforced by T0019 onboarding).
 *
 * A username identifies an author to other people; it never authorizes anything.
 * Rules: 3–24 ASCII letters/digits with inner `_` or `-`, starting and ending with a
 * letter or digit. ASCII-only avoids homoglyph impersonation. Uniqueness is
 * case-insensitive through `normalized` (lowercase), which D1 stores in a UNIQUE column.
 */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;
const USERNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/;

/**
 * Route segments, staff-like names and impersonation-prone handles. Compared after
 * normalization and after removing `_`/`-`, so `Ad-min` is reserved too.
 */
export const RESERVED_USERNAMES: readonly string[] = Object.freeze([
  'about', 'account', 'accounts', 'admin', 'administrator', 'api', 'app', 'assets', 'auth', 'build',
  'builds', 'callback', 'cloudflare', 'contact', 'copy', 'dashboard', 'delete', 'discord', 'docs',
  'edit', 'everyone', 'explore', 'faq', 'favicon', 'gorgon', 'gorgonbuilder', 'google', 'guest',
  'help', 'home', 'index', 'login', 'logout', 'me', 'mod', 'moderator', 'my', 'mybuilds', 'new',
  'null', 'oauth', 'official', 'planner', 'privacy', 'profile', 'profiles', 'projectgorgon',
  'public', 'register', 'root', 'search', 'security', 'settings', 'share', 'signin', 'signout',
  'signup', 'staff', 'static', 'support', 'system', 'terms', 'undefined', 'user', 'users', 'www',
]);
const reserved = new Set(RESERVED_USERNAMES);

export type UsernameErrorCode = 'too_short' | 'too_long' | 'invalid_characters' | 'reserved';
export type UsernameResult =
  | { ok: true; display: string; normalized: string }
  | { ok: false; code: UsernameErrorCode; message: string };

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateUsername(value: unknown): UsernameResult {
  if (typeof value !== 'string') return { ok: false, code: 'invalid_characters', message: 'Username must be text.' };
  const display = value.trim();
  if (display.length < USERNAME_MIN_LENGTH) {
    return { ok: false, code: 'too_short', message: `Username must be at least ${USERNAME_MIN_LENGTH} characters.` };
  }
  if (display.length > USERNAME_MAX_LENGTH) {
    return { ok: false, code: 'too_long', message: `Username must be at most ${USERNAME_MAX_LENGTH} characters.` };
  }
  if (!USERNAME_PATTERN.test(display)) {
    return {
      ok: false, code: 'invalid_characters',
      message: 'Use letters, numbers, "_" or "-", starting and ending with a letter or number.',
    };
  }
  const normalized = normalizeUsername(display);
  if (reserved.has(normalized) || reserved.has(normalized.replace(/[_-]/g, ''))) {
    return { ok: false, code: 'reserved', message: 'That username is reserved.' };
  }
  return { ok: true, display, normalized };
}
