/**
 * TEST-ONLY shared behavioural contract for every BuildRepository implementation.
 * T0018 runs it against the in-memory fake; T0019 must run it unchanged against D1.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { GUEST, userActor } from '../access';
import { BUILD_JSON_MAX_BYTES, type BuildRecord } from '../build-record';
import type { BuildRepository, RepositoryResult } from '../build-repository';
import { buildFixture } from './fixtures';

const alice = userActor('user-alice');
const bob = userActor('user-bob');

function value<T>(result: RepositoryResult<T>): T {
  if (!result.ok) throw new Error(`Expected success, got ${result.error.code}: ${result.error.message}`);
  return result.value;
}

function code(result: RepositoryResult<unknown>): string {
  return result.ok ? 'ok' : result.error.code;
}

export function describeBuildRepositoryContract(name: string, factory: () => BuildRepository): void {
  describe(`BuildRepository contract: ${name}`, () => {
    let repo: BuildRepository;
    beforeEach(() => { repo = factory(); });

    async function create(actor = alice, extra: Record<string, unknown> = {}): Promise<BuildRecord> {
      return value(await repo.create(actor, { document: buildFixture(), ...extra }));
    }

    describe('lifecycle', () => {
      it('creates an owner-bound Private build with server-derived metadata', async () => {
        const record = await create(alice, { title: '  My Cow build  ' });
        expect(record).toMatchObject({
          ownerUserId: 'user-alice', visibility: 'private', title: 'My Cow build', publicDescription: '',
          skillAId: 'Cow', skillBId: 'Unarmed', schemaVersion: 1, gameDataVersion: '490', revision: 1,
        });
        expect(record.id).toMatch(/^[A-Za-z0-9_-]{16}$/);
        expect(record.updatedAt).toBe(record.createdAt);
      });

      it('round-trips the original BuildDocument v1 exactly', async () => {
        const original = buildFixture();
        const created = await create(alice, { document: original });
        expect(created.document).toEqual(original);
        expect(value(await repo.get(alice, created.id)).document).toEqual(original);
      });

      it('defaults the listing title to the document title', async () => {
        expect((await create()).title).toBe('Cow/Unarmed');
        const untitled = buildFixture(null, null, '   ');
        expect(value(await repo.create(alice, { document: untitled })).title).toBe('Untitled build');
      });

      it('isolates stored data from caller mutation', async () => {
        const document = buildFixture();
        const created = await create(alice, { document });
        document.title = 'mutated by caller';
        created.document.notes = 'mutated result';
        const reread = value(await repo.get(alice, created.id));
        expect(reread.document.title).toBe('Cow/Unarmed');
        expect(reread.document.notes).not.toBe('mutated result');
      });

      it('updates fields, re-derives skills from the new document and increments revision', async () => {
        const created = await create();
        const updated = value(await repo.update(alice, created.id, {
          expectedRevision: 1, document: buildFixture('Psychology', null), title: 'Psych', publicDescription: 'Line 1\r\nLine 2',
          visibility: 'unlisted',
        }));
        expect(updated).toMatchObject({
          id: created.id, ownerUserId: 'user-alice', title: 'Psych', publicDescription: 'Line 1\nLine 2',
          visibility: 'unlisted', skillAId: 'Psychology', skillBId: null, revision: 2, createdAt: created.createdAt,
        });
        expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
      });

      it('rejects stale and empty updates', async () => {
        const created = await create();
        value(await repo.update(alice, created.id, { expectedRevision: 1, title: 'Second' }));
        expect(code(await repo.update(alice, created.id, { expectedRevision: 1, title: 'Lost update' }))).toBe('revision_conflict');
        expect(code(await repo.update(alice, created.id, { expectedRevision: 2 }))).toBe('invalid_request');
        expect(value(await repo.get(alice, created.id)).title).toBe('Second');
      });

      it('deletes with the current revision only', async () => {
        const created = await create();
        expect(code(await repo.delete(alice, created.id, { expectedRevision: 9 }))).toBe('revision_conflict');
        expect(value(await repo.delete(alice, created.id, { expectedRevision: 1 }))).toEqual({ id: created.id });
        expect(code(await repo.get(alice, created.id))).toBe('not_found');
        expect(code(await repo.delete(alice, created.id, { expectedRevision: 1 }))).toBe('not_found');
      });
    });

    describe('visibility and authorization boundaries', () => {
      it('Private is owner-only and indistinguishable from missing for everyone else', async () => {
        const record = await create();
        expect(code(await repo.get(alice, record.id))).toBe('ok');
        expect(code(await repo.get(bob, record.id))).toBe('not_found');
        expect(code(await repo.get(GUEST, record.id))).toBe('not_found');
        expect(await repo.get(bob, record.id)).toEqual(await repo.get(bob, 'AAAAAAAAAAAAAAAA'));
        expect(code(await repo.update(bob, record.id, { expectedRevision: 1, title: 'x' }))).toBe('not_found');
        expect(code(await repo.copy(bob, record.id))).toBe('not_found');
      });

      it('Unlisted and Public are link-readable by guests and other users', async () => {
        for (const visibility of ['unlisted', 'public'] as const) {
          const record = await create(alice, { visibility });
          expect(value(await repo.get(GUEST, record.id)).document).toEqual(buildFixture());
          expect(code(await repo.get(bob, record.id))).toBe('ok');
        }
      });

      it('only the owner can modify or delete, even Public builds', async () => {
        const record = await create(alice, { visibility: 'public' });
        expect(code(await repo.update(bob, record.id, { expectedRevision: 1, visibility: 'private' }))).toBe('forbidden');
        expect(code(await repo.delete(bob, record.id, { expectedRevision: 1 }))).toBe('forbidden');
        expect(code(await repo.update(GUEST, record.id, { expectedRevision: 1, title: 'x' }))).toBe('unauthenticated');
        expect(code(await repo.delete(GUEST, record.id, { expectedRevision: 1 }))).toBe('unauthenticated');
        expect(value(await repo.get(alice, record.id)).revision).toBe(1);
      });

      it('guests cannot create, copy or list an account library', async () => {
        const record = await create(alice, { visibility: 'public' });
        expect(code(await repo.create(GUEST, { document: buildFixture() }))).toBe('unauthenticated');
        expect(code(await repo.copy(GUEST, record.id))).toBe('unauthenticated');
        expect(code(await repo.listOwn(GUEST))).toBe('unauthenticated');
      });

      it('never accepts a client-supplied owner', async () => {
        // BuildDocument v1 is a closed schema, so an injected owner field is rejected outright.
        expect(code(await repo.create(alice, { document: { ...buildFixture(), ownerUserId: 'user-bob' } })))
          .toBe('invalid_document');
        // Unknown input fields are ignored; ownership always comes from the verified actor.
        const record = value(await repo.create(alice, { document: buildFixture(), ownerUserId: 'user-bob' } as never));
        expect(record.ownerUserId).toBe('user-alice');
        expect(code(await repo.get(bob, record.id))).toBe('not_found');
      });

      it('revoking Public to Private immediately removes outsider access and listing', async () => {
        const record = await create(alice, { visibility: 'public' });
        expect(value(await repo.listPublicByOwner('user-alice')).items).toHaveLength(1);
        value(await repo.update(alice, record.id, { expectedRevision: 1, visibility: 'private' }));
        expect(code(await repo.get(GUEST, record.id))).toBe('not_found');
        expect(code(await repo.get(bob, record.id))).toBe('not_found');
        expect(value(await repo.listPublicByOwner('user-alice')).items).toEqual([]);
      });
    });

    describe('copy semantics', () => {
      it('copies a readable build into a new Private build owned by the copier', async () => {
        const source = await create(alice, { visibility: 'public', publicDescription: 'Alice wrote this.' });
        const copy = value(await repo.copy(bob, source.id));
        expect(copy).toMatchObject({
          ownerUserId: 'user-bob', visibility: 'private', title: source.title, publicDescription: '',
          skillAId: 'Cow', skillBId: 'Unarmed', revision: 1,
        });
        expect(copy.id).not.toBe(source.id);
        expect(copy.document).toEqual(source.document);
        expect(value(await repo.get(alice, source.id))).toEqual(source);
        expect(code(await repo.get(alice, copy.id))).toBe('not_found');
      });

      it('copies Unlisted builds by link and the owner can duplicate their own Private build', async () => {
        const unlisted = await create(alice, { visibility: 'unlisted' });
        expect(value(await repo.copy(bob, unlisted.id, { title: 'Bob variant' })).title).toBe('Bob variant');
        const own = await create(alice);
        expect(value(await repo.copy(alice, own.id)).ownerUserId).toBe('user-alice');
      });

      it('later source edits do not change the copy', async () => {
        const source = await create(alice, { visibility: 'public' });
        const copy = value(await repo.copy(bob, source.id));
        value(await repo.update(alice, source.id, { expectedRevision: 1, document: buildFixture('Psychology', 'Cow', 'Changed') }));
        expect(value(await repo.get(bob, copy.id)).document).toEqual(buildFixture());
      });
    });

    describe('listings', () => {
      it('owner library contains every visibility; public profile only Public', async () => {
        const ids = [];
        for (const visibility of ['private', 'unlisted', 'public'] as const) ids.push((await create(alice, { visibility })).id);
        await create(bob, { visibility: 'public' });
        const own = value(await repo.listOwn(alice)).items;
        expect(own.map(item => item.id).sort()).toEqual([...ids].sort());
        expect(own.every(item => !('document' in item))).toBe(true);
        const profile = value(await repo.listPublicByOwner('user-alice')).items;
        expect(profile.map(item => item.visibility)).toEqual(['public']);
        expect(value(await repo.listOwn(bob)).items).toHaveLength(1);
      });

      it('paginates newest-first with stable keyset cursors and no overlap', async () => {
        for (let i = 0; i < 5; i++) await create(alice, { title: `Build ${i}` });
        const first = value(await repo.listOwn(alice, { limit: 2 }));
        const second = value(await repo.listOwn(alice, { limit: 2, cursor: first.nextCursor }));
        const third = value(await repo.listOwn(alice, { limit: 2, cursor: second.nextCursor }));
        expect([...first.items, ...second.items, ...third.items].map(item => item.title))
          .toEqual(['Build 4', 'Build 3', 'Build 2', 'Build 1', 'Build 0']);
        expect(third.nextCursor).toBeNull();
        expect(code(await repo.listOwn(alice, { limit: 0 }))).toBe('invalid_request');
        expect(code(await repo.listOwn(alice, { limit: 51 }))).toBe('invalid_request');
        expect(code(await repo.listOwn(alice, { cursor: 'not a cursor' }))).toBe('invalid_request');
      });
    });

    describe('payload validation and errors', () => {
      it('rejects invalid, future-version and raw import payloads', async () => {
        expect(code(await repo.create(alice, { document: { title: 'not a build' } }))).toBe('invalid_document');
        expect(code(await repo.create(alice, { document: { ...buildFixture(), schemaVersion: 2 } }))).toBe('unsupported_schema_version');
        const rawReport: unknown = JSON.parse(readFileSync(resolve('src/core/import/fixtures/character-sheet.json'), 'utf8'));
        expect(code(await repo.create(alice, { document: rawReport }))).toBe('invalid_document');
      });

      it('caps the serialized document size', async () => {
        const document = buildFixture();
        document.notes = 'x'.repeat(BUILD_JSON_MAX_BYTES);
        expect(code(await repo.create(alice, { document }))).toBe('payload_too_large');
      });

      it('validates listing metadata', async () => {
        expect(code(await repo.create(alice, { document: buildFixture(), title: '' }))).toBe('invalid_metadata');
        expect(code(await repo.create(alice, { document: buildFixture(), title: 'x'.repeat(121) }))).toBe('invalid_metadata');
        expect(code(await repo.create(alice, { document: buildFixture(), title: 'bad\u0000title' }))).toBe('invalid_metadata');
        expect(code(await repo.create(alice, { document: buildFixture(), publicDescription: 'x'.repeat(2001) }))).toBe('invalid_metadata');
        expect(code(await repo.create(alice, { document: buildFixture(), visibility: 'secret' }))).toBe('invalid_metadata');
        expect(code(await repo.update(alice, (await create()).id, { expectedRevision: 0, title: 'x' }))).toBe('invalid_request');
      });

      it('leaves stored data unchanged when an update is rejected', async () => {
        const created = await create();
        expect(code(await repo.update(alice, created.id, { expectedRevision: 1, title: 'ok', visibility: 'secret' }))).toBe('invalid_metadata');
        expect(value(await repo.get(alice, created.id))).toEqual(created);
      });
    });
  });
}
