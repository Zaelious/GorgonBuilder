/**
 * Public Search Builds contract for T0020-F1 (no endpoint or UI exists in T0018).
 *
 * The reference predicate below is the semantic oracle that the future server-side
 * D1 query must match. Search only ever considers Public builds; Private and Unlisted
 * builds must not influence results, counts, ordering or autocomplete.
 */
import { isPubliclyListed } from './access';
import type { BuildSummary } from './build-record';

export const SEARCH_TEXT_MAX_LENGTH = 100;
export const SEARCH_PAGE_DEFAULT_LIMIT = 20;
export const SEARCH_PAGE_MAX_LIMIT = 50;

export type SkillFilter = readonly [] | readonly [string] | readonly [string, string];

export interface PublicBuildSearchQuery {
  /** Case-insensitive match against title, public description or author username. Empty = no text filter. */
  text: string;
  /** 0–2 distinct canonical *combat skill* IDs (not ability-bar abilities). */
  skillIds: SkillFilter;
  /** Only meaningful with two skills: true = both (AND, either slot order); false = either (OR). */
  matchBothSkills: boolean;
  /** Recent public builds first; ties broken by ID for stable keyset pagination. */
  sort: 'recent';
  limit: number;
  cursor: string | null;
}

export type SearchQueryResult =
  | { ok: true; value: PublicBuildSearchQuery }
  | { ok: false; code: 'invalid_query'; message: string };

export interface RawSearchQuery {
  text?: unknown;
  skillIds?: unknown;
  matchBothSkills?: unknown;
  limit?: unknown;
  cursor?: unknown;
}

export function parsePublicBuildSearchQuery(raw: RawSearchQuery): SearchQueryResult {
  const text = raw.text === undefined ? '' : raw.text;
  if (typeof text !== 'string') return invalid('Search text must be a string.');
  const trimmed = text.trim();
  if ([...trimmed].length > SEARCH_TEXT_MAX_LENGTH) return invalid(`Search text must be at most ${SEARCH_TEXT_MAX_LENGTH} characters.`);

  const rawSkills = raw.skillIds === undefined ? [] : raw.skillIds;
  if (!Array.isArray(rawSkills) || !rawSkills.every(id => typeof id === 'string' && id.trim())) {
    return invalid('Skill filters must be skill IDs.');
  }
  const unique = [...new Set(rawSkills as string[])];
  if (unique.length > 2) return invalid('At most two combat skills can be selected.');

  const matchBothSkills = raw.matchBothSkills === undefined ? true : raw.matchBothSkills;
  if (typeof matchBothSkills !== 'boolean') return invalid('Match both skills must be true or false.');

  const limit = raw.limit === undefined ? SEARCH_PAGE_DEFAULT_LIMIT : raw.limit;
  if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > SEARCH_PAGE_MAX_LIMIT) {
    return invalid(`Limit must be an integer from 1 to ${SEARCH_PAGE_MAX_LIMIT}.`);
  }
  const cursor = raw.cursor === undefined || raw.cursor === null ? null : raw.cursor;
  if (cursor !== null && typeof cursor !== 'string') return invalid('Cursor must be a string.');

  return {
    ok: true,
    value: { text: trimmed, skillIds: unique as unknown as SkillFilter, matchBothSkills, sort: 'recent', limit, cursor },
  };
}

/**
 * One skill: either slot contains it. Two skills: `matchBoth` requires both somewhere in
 * the two slots (unordered AND); otherwise either skill suffices (OR).
 */
export function matchesSkillFilter(
  build: Pick<BuildSummary, 'skillAId' | 'skillBId'>, skillIds: SkillFilter, matchBoth: boolean,
): boolean {
  const slots = [build.skillAId, build.skillBId];
  if (skillIds.length === 0) return true;
  const hits = skillIds.map(id => slots.includes(id));
  return skillIds.length === 2 && matchBoth ? hits.every(Boolean) : hits.some(Boolean);
}

export interface SearchableListing extends Pick<BuildSummary, 'visibility' | 'title' | 'publicDescription' | 'skillAId' | 'skillBId'> {
  authorUsername: string;
}

/** Reference semantics: Public only, text AND skills. */
export function matchesPublicSearch(listing: SearchableListing, query: PublicBuildSearchQuery): boolean {
  if (!isPubliclyListed(listing)) return false;
  const needle = query.text.toLowerCase();
  const textHit = !needle || [listing.title, listing.publicDescription, listing.authorUsername]
    .some(field => field.toLowerCase().includes(needle));
  return textHit && matchesSkillFilter(listing, query.skillIds, query.matchBothSkills);
}

function invalid(message: string): SearchQueryResult {
  return { ok: false, code: 'invalid_query', message };
}
