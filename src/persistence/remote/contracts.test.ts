import { describe, expect, it } from 'vitest';
import { canModify, canRead, GUEST, isPubliclyListed, userActor } from './access';
import { generateBuildId, isBuildId, seededRandomBytes } from './build-id';
import {
  BUILD_JSON_MAX_BYTES, normalizeBuildTitle, normalizePublicDescription, prepareBuildDocument,
} from './build-record';
import { matchesPublicSearch, matchesSkillFilter, parsePublicBuildSearchQuery, type PublicBuildSearchQuery } from './search-contract';
import { RESERVED_USERNAMES, validateUsername } from './username';
import { buildFixture } from './testing/fixtures';

describe('build IDs', () => {
  it('are 16-character base64url strings from 96 random bits', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => generateBuildId()));
    expect(ids.size).toBe(2000);
    for (const id of ids) expect(isBuildId(id)).toBe(true);
    expect(generateBuildId(seededRandomBytes(1))).toBe(generateBuildId(seededRandomBytes(1)));
    expect(generateBuildId(seededRandomBytes(1))).not.toBe(generateBuildId(seededRandomBytes(2)));
    for (const bad of ['', 'short', 'AAAAAAAAAAAAAAA/', 'AAAAAAAAAAAAAAAAA', 42, null]) expect(isBuildId(bad)).toBe(false);
  });
});

describe('access rules', () => {
  const owner = userActor('owner');
  const other = userActor('other');
  it.each([
    ['private', [true, false, false]],
    ['unlisted', [true, true, true]],
    ['public', [true, true, true]],
  ] as const)('%s read access for owner/other/guest', (visibility, expected) => {
    const build = { ownerUserId: 'owner', visibility };
    expect([canRead(owner, build), canRead(other, build), canRead(GUEST, build)]).toEqual(expected);
    expect([canModify(owner, build), canModify(other, build), canModify(GUEST, build)]).toEqual([true, false, false]);
    expect(isPubliclyListed(build)).toBe(visibility === 'public');
  });
  it('requires a nonempty verified user ID', () => {
    expect(() => userActor(' ')).toThrow();
  });
});

describe('build payload preparation', () => {
  it('derives indexed skills and versions from the validated document only', () => {
    const result = prepareBuildDocument(buildFixture('Psychology', null));
    expect(result.ok && result.value.metadata).toEqual({ skillAId: 'Psychology', skillBId: null, schemaVersion: 1, gameDataVersion: '490' });
    expect(result.ok && JSON.parse(result.value.json)).toEqual(buildFixture('Psychology', null));
  });
  it('measures UTF-8 bytes, not UTF-16 code units', () => {
    const document = buildFixture();
    document.notes = '🐄'.repeat(BUILD_JSON_MAX_BYTES / 4);
    const result = prepareBuildDocument(document);
    expect(!result.ok && result.error.code).toBe('payload_too_large');
  });
  it('normalizes titles and descriptions as plain text', () => {
    expect(normalizeBuildTitle('  Cow/Unarmed  ')).toEqual({ ok: true, value: 'Cow/Unarmed' });
    expect(normalizeBuildTitle('<script>alert(1)</script>')).toEqual({ ok: true, value: '<script>alert(1)</script>' });
    expect(normalizeBuildTitle('🐄'.repeat(120)).ok).toBe(true);
    expect(normalizeBuildTitle('a\nb').ok).toBe(false);
    expect(normalizeBuildTitle('evil‮override').ok).toBe(false);
    expect(normalizePublicDescription('a\r\n\tb')).toEqual({ ok: true, value: 'a\n\tb' });
    expect(normalizePublicDescription(5).ok).toBe(false);
  });
});

describe('usernames', () => {
  it('accepts ASCII handles and normalizes case for uniqueness', () => {
    expect(validateUsername('  Moo_Cow-90 ')).toEqual({ ok: true, display: 'Moo_Cow-90', normalized: 'moo_cow-90' });
    expect(validateUsername('abc').ok).toBe(true);
    expect(validateUsername('a'.repeat(24)).ok).toBe(true);
  });
  it.each([
    ['ab', 'too_short'], ['a'.repeat(25), 'too_long'], ['_cow', 'invalid_characters'], ['cow-', 'invalid_characters'],
    ['cow cow', 'invalid_characters'], ['сow', 'invalid_characters'], ['ADMIN', 'reserved'], ['Ad-Min', 'reserved'],
    ['my_builds', 'reserved'], ['api', 'reserved'],
  ])('rejects %s as %s', (input, expected) => {
    const result = validateUsername(input);
    expect(!result.ok && result.code).toBe(expected);
  });
  it('reserves every route-sensitive segment', () => {
    for (const segment of ['api', 'auth', 'builds', 'search', 'me', 'settings', 'login', 'logout']) {
      expect(RESERVED_USERNAMES).toContain(segment);
    }
  });
});

describe('public search contract', () => {
  const query = (overrides: Partial<PublicBuildSearchQuery> = {}): PublicBuildSearchQuery => ({
    text: '', skillIds: [], matchBothSkills: true, sort: 'recent', limit: 20, cursor: null, ...overrides,
  });
  const listing = (skillAId: string | null, skillBId: string | null, visibility: 'public' | 'unlisted' | 'private' = 'public') => ({
    visibility, title: 'Cow brawler', publicDescription: 'Stampede focus', authorUsername: 'MooMoo', skillAId, skillBId,
  });

  it('one skill matches either slot', () => {
    expect(matchesSkillFilter(listing('Cow', 'Unarmed'), ['Unarmed'], true)).toBe(true);
    expect(matchesSkillFilter(listing('Unarmed', null), ['Unarmed'], false)).toBe(true);
    expect(matchesSkillFilter(listing('Cow', null), ['Unarmed'], true)).toBe(false);
  });
  it('two skills with Match both = unordered AND; off = OR', () => {
    expect(matchesSkillFilter(listing('Cow', 'Unarmed'), ['Unarmed', 'Cow'], true)).toBe(true);
    expect(matchesSkillFilter(listing('Unarmed', 'Cow'), ['Cow', 'Unarmed'], true)).toBe(true);
    expect(matchesSkillFilter(listing('Cow', 'Psychology'), ['Cow', 'Unarmed'], true)).toBe(false);
    expect(matchesSkillFilter(listing('Cow', 'Cow'), ['Cow', 'Unarmed'], true)).toBe(false);
    expect(matchesSkillFilter(listing('Cow', 'Psychology'), ['Cow', 'Unarmed'], false)).toBe(true);
    expect(matchesSkillFilter(listing('Deer', 'Psychology'), ['Cow', 'Unarmed'], false)).toBe(false);
  });
  it('combines text AND skills and never matches non-public builds', () => {
    expect(matchesPublicSearch(listing('Cow', 'Unarmed'), query({ text: 'moomoo', skillIds: ['Cow'] }))).toBe(true);
    expect(matchesPublicSearch(listing('Cow', 'Unarmed'), query({ text: 'stampede' }))).toBe(true);
    expect(matchesPublicSearch(listing('Cow', 'Unarmed'), query({ text: 'deer', skillIds: ['Cow'] }))).toBe(false);
    expect(matchesPublicSearch(listing('Cow', 'Unarmed', 'unlisted'), query())).toBe(false);
    expect(matchesPublicSearch(listing('Cow', 'Unarmed', 'private'), query({ text: 'cow' }))).toBe(false);
  });
  it('parses and bounds query input', () => {
    expect(parsePublicBuildSearchQuery({})).toEqual({ ok: true, value: query() });
    expect(parsePublicBuildSearchQuery({ text: '  cow ', skillIds: ['Cow', 'Cow'], matchBothSkills: false })).toEqual({
      ok: true, value: query({ text: 'cow', skillIds: ['Cow'], matchBothSkills: false }),
    });
    for (const bad of [
      { skillIds: ['A', 'B', 'C'] }, { skillIds: 'Cow' }, { skillIds: [''] }, { text: 'x'.repeat(101) },
      { limit: 0 }, { limit: 51 }, { limit: 1.5 }, { matchBothSkills: 'yes' }, { cursor: 3 },
    ]) expect(parsePublicBuildSearchQuery(bad).ok).toBe(false);
  });
});
