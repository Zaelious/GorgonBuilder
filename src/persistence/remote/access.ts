/**
 * Pure server-side access rules shared by every BuildRepository implementation.
 * The actor must come from a server-verified session; client-supplied owner fields,
 * usernames, emails, OAuth provider IDs and build IDs never establish identity.
 */
import type { BuildSummary } from './build-record';

export type Actor =
  | { readonly kind: 'guest' }
  | { readonly kind: 'user'; readonly userId: string };

export const GUEST: Actor = Object.freeze({ kind: 'guest' });

export function userActor(userId: string): Actor {
  if (!userId.trim()) throw new TypeError('A user actor requires a server-verified userId.');
  return Object.freeze({ kind: 'user', userId });
}

type AccessFields = Pick<BuildSummary, 'ownerUserId' | 'visibility'>;

export function isOwner(actor: Actor, build: AccessFields): boolean {
  return actor.kind === 'user' && actor.userId === build.ownerUserId;
}

/** Public and Unlisted are readable by anyone holding the ID; Private only by its owner. */
export function canRead(actor: Actor, build: AccessFields): boolean {
  return build.visibility !== 'private' || isOwner(actor, build);
}

/** Update, delete and visibility changes are owner-only regardless of visibility. */
export function canModify(actor: Actor, build: AccessFields): boolean {
  return isOwner(actor, build);
}

/** Only Public builds may appear in search results, author profiles, counts or autocomplete. */
export function isPubliclyListed(build: Pick<BuildSummary, 'visibility'>): boolean {
  return build.visibility === 'public';
}
