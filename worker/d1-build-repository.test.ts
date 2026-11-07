// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createD1BuildRepository } from '../src/persistence/remote/d1-build-repository';
import type { BuildDatabase, D1Statement } from '../src/persistence/remote/d1';
import { describeBuildRepositoryContract } from '../src/persistence/remote/testing/build-repository-contract';
import { buildFixture } from '../src/persistence/remote/testing/fixtures';
import { userActor } from '../src/persistence/remote/access';
import { localD1, resetD1, seedUser } from './testing/local-d1';
import { GAME_DATA_VERSION, isKnownCombatSkillId } from './api/game-policy';

let db: BuildDatabase;
let dispose: () => Promise<void>;
beforeAll(async () => { ({ db, dispose } = await localD1()); }, 30000);
afterAll(async () => { await dispose?.(); });
beforeEach(async () => {
  await resetD1(db);
  await seedUser(db, 'user-alice'); await seedUser(db, 'user-bob');
});
describeBuildRepositoryContract('native local D1 (workerd)', () => {
  let tick = 0;
  return createD1BuildRepository(db, { now: () => 1000 + tick++ });
});
const alice = userActor('user-alice');
describe('D1 atomic writes and constraints', () => {
  it('allows exactly one concurrent update or update/delete at a given revision', async () => {
    const repo = createD1BuildRepository(db);
    const created = await repo.create(alice, { document: buildFixture() });
    if (!created.ok) throw new Error();
    const id = created.value.id;
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => repo.update(alice, id, { expectedRevision: 1, title: `Writer ${i}` })));
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(results.filter(r => !r.ok && r.error.code === 'revision_conflict')).toHaveLength(7);
    const raced = await Promise.all([repo.update(alice, id, { expectedRevision: 2, title: 'edit' }), repo.delete(alice, id, { expectedRevision: 2 })]);
    expect(raced.filter(r => r.ok)).toHaveLength(1);
  });
  it('rechecks privacy at copy insertion when the source is revoked after its read', async () => {
    const repo = createD1BuildRepository(db);
    const source = await repo.create(alice, { document: buildFixture(), visibility: 'public' });
    if (!source.ok) throw new Error();
    const guarded: BuildDatabase = {
      batch: statements => db.batch(statements),
      prepare(sql) {
        const statement = db.prepare(sql);
        if (!sql.includes("SELECT ?, ?, 'private'")) return statement;
        const beforeInsert = (bound: D1Statement): D1Statement => ({
          bind: (...values) => beforeInsert(bound.bind(...values)),
          async first<T>() {
            await repo.update(alice, source.value.id, { expectedRevision: 1, visibility: 'private' });
            return bound.first<T>();
          },
          all: () => bound.all(), run: () => bound.run(),
        });
        return beforeInsert(statement);
      },
    };
    const copy = await createD1BuildRepository(guarded).copy(userActor('user-bob'), source.value.id);
    expect(!copy.ok && copy.error.code).toBe('not_found');
    expect(await db.prepare('SELECT count(*) AS n FROM build').first()).toEqual({ n: 1 });
  });
  it('enforces foreign keys/cascade and batch rollback in real D1', async () => {
    const repo = createD1BuildRepository(db);
    await repo.create(alice, { document: buildFixture() });
    await expect(repo.create(userActor('nonexistent'), { document: buildFixture() })).rejects.toThrow();
    await expect(db.batch([
      db.prepare(`UPDATE "user" SET name='changed' WHERE id='user-alice'`),
      db.prepare(`INSERT INTO profile VALUES ('absent','Name','name',0,0)`),
    ])).rejects.toThrow();
    expect(await db.prepare(`SELECT name FROM "user" WHERE id='user-alice'`).first()).toEqual({ name: 'Private provider name' });
    await db.prepare(`DELETE FROM "user" WHERE id='user-alice'`).run();
    expect(await db.prepare('SELECT count(*) AS n FROM build').first()).toEqual({ n: 0 });
  });
  it('enforces the pinned version and official combat slots without rejecting incomplete drafts', async () => {
    const repo = createD1BuildRepository(db, { isKnownCombatSkillId, validateGameDataVersion: v => v === GAME_DATA_VERSION });
    for (const doc of [{ ...buildFixture(), gameDataVersion: 'future' }, buildFixture('Alchemy'), buildFixture("Cow'; DROP TABLE build;--")]) {
      const result = await repo.create(alice, { document: doc });
      expect(!result.ok && result.error.code).toBe('invalid_document');
    }
    expect((await repo.create(alice, { document: { ...buildFixture(null, null), gameDataVersion: GAME_DATA_VERSION } })).ok).toBe(true);
  });
  it('paginates tied timestamps with no overlap using indexed public-only queries', async () => {
    const repo = createD1BuildRepository(db, { now: () => 1 });
    for (let i = 0; i < 7; i++) await repo.create(alice, { document: buildFixture(), visibility: i % 2 ? 'private' : 'public' });
    const first = await repo.listPublicByOwner('user-alice', { limit: 2 });
    if (!first.ok) throw new Error();
    const next = await repo.listPublicByOwner('user-alice', { limit: 2, cursor: first.value.nextCursor });
    if (!next.ok) throw new Error();
    expect(new Set([...first.value.items, ...next.value.items].map(r => r.id)).size).toBe(4);
    expect(next.value.nextCursor).toBeNull();
  });
});
