// @vitest-environment node
/**
 * Applies the committed D1 migrations to an in-memory SQLite database (D1 is SQLite) to check
 * constraints and representative query plans. Real local-D1 application through Wrangler is
 * covered by `npm run worker:smoke`.
 */
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BUILD_JSON_MAX_BYTES, BUILD_PUBLIC_DESCRIPTION_MAX_LENGTH, BUILD_TITLE_MAX_LENGTH,
} from '../src/persistence/remote/build-record';
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from '../src/persistence/remote/username';
import { applyMigrations, migrationFiles } from './testing/sqlite-migrations';

let db: DatabaseSync;
let nextId = 0;

function addUser(id: string) {
  db.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, 'n', ?, 0, '2026-01-01', '2026-01-01')`)
    .run(id, `${id}@example.invalid`);
}

function addBuild(fields: Partial<Record<string, string | number | null>> = {}) {
  const row = {
    id: `build${String(nextId++).padStart(11, '0')}`, owner_user_id: 'u1', visibility: 'private', title: 'T',
    public_description: '', skill_a_id: 'Cow', skill_b_id: 'Unarmed', schema_version: 1, game_data_version: '490',
    build_json: '{}', revision: 1, created_at: 1, updated_at: 1, ...fields,
  };
  const keys = Object.keys(row);
  db.prepare(`INSERT INTO "build" (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
    .run(...Object.values(row));
  return row.id;
}

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  applyMigrations(db);
  addUser('u1');
  addUser('u2');
});

describe('D1 migrations', () => {
  it('are sequentially numbered, uniquely prefixed SQL files', () => {
    const files = migrationFiles();
    expect(files).toEqual(['0001_better_auth_core.sql', '0002_profiles_and_builds.sql', '0003_api_rate_limit.sql']);
    files.forEach((file, index) => expect(file.startsWith(String(index + 1).padStart(4, '0') + '_')).toBe(true));
  });

  it('create the auth, profile and build tables separately', () => {
    const tables = db.prepare(`SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name`).all().map(r => r.name);
    expect(tables).toEqual(['account', 'api_rate_limit', 'build', 'profile', 'session', 'user', 'verification']);
    const buildColumns = db.prepare(`SELECT name FROM pragma_table_info('build')`).all().map(r => r.name);
    expect(buildColumns).not.toContain('raw_report');
    expect(buildColumns).not.toContain('owner_token');
    expect(buildColumns).toEqual(expect.arrayContaining(['owner_user_id', 'visibility', 'skill_a_id', 'skill_b_id', 'build_json']));
  });

  it('default new builds to private and enforce the visibility set', () => {
    db.prepare(`INSERT INTO "build" (id, owner_user_id, title, schema_version, game_data_version, build_json, created_at, updated_at)
      VALUES ('AAAAAAAAAAAAAAAA', 'u1', 'T', 1, '490', '{}', 1, 1)`).run();
    expect(db.prepare(`SELECT visibility, revision, public_description FROM "build"`).get())
      .toEqual({ visibility: 'private', revision: 1, public_description: '' });
    expect(() => addBuild({ visibility: 'secret' })).toThrow(/CHECK/);
  });

  it('mirror the application limits', () => {
    expect(() => addBuild({ title: '' })).toThrow(/CHECK/);
    expect(() => addBuild({ title: 'x'.repeat(BUILD_TITLE_MAX_LENGTH) })).not.toThrow();
    expect(() => addBuild({ title: 'x'.repeat(BUILD_TITLE_MAX_LENGTH + 1) })).toThrow(/CHECK/);
    expect(() => addBuild({ public_description: 'x'.repeat(BUILD_PUBLIC_DESCRIPTION_MAX_LENGTH + 1) })).toThrow(/CHECK/);
    expect(() => addBuild({ build_json: 'not json' })).toThrow(/CHECK/);
    expect(() => addBuild({ build_json: JSON.stringify('x'.repeat(BUILD_JSON_MAX_BYTES)) })).toThrow(/CHECK/);
    expect(() => addBuild({ id: 'short' })).toThrow(/CHECK/);
    expect(() => addBuild({ revision: 0 })).toThrow(/CHECK/);
  });

  it('require a real owner and cascade account deletion to builds and profile', () => {
    expect(() => addBuild({ owner_user_id: 'ghost' })).toThrow(/FOREIGN KEY/);
    addBuild();
    db.prepare(`INSERT INTO "profile" VALUES ('u1', 'MooCow', 'moocow', 1, 1)`).run();
    db.prepare(`DELETE FROM "user" WHERE id = 'u1'`).run();
    expect(db.prepare(`SELECT count(*) AS n FROM "build"`).get()).toEqual({ n: 0 });
    expect(db.prepare(`SELECT count(*) AS n FROM "profile"`).get()).toEqual({ n: 0 });
  });

  it('keep usernames case-insensitively unique and length-bounded', () => {
    db.prepare(`INSERT INTO "profile" VALUES ('u1', 'MooCow', 'moocow', 1, 1)`).run();
    expect(() => db.prepare(`INSERT INTO "profile" VALUES ('u2', 'MOOCOW', 'moocow', 1, 1)`).run()).toThrow(/UNIQUE/);
    expect(() => db.prepare(`INSERT INTO "profile" VALUES ('u2', 'Other', 'Other', 1, 1)`).run()).toThrow(/CHECK/);
    const short = 'x'.repeat(USERNAME_MIN_LENGTH - 1);
    const long = 'x'.repeat(USERNAME_MAX_LENGTH + 1);
    expect(() => db.prepare(`INSERT INTO "profile" VALUES ('u2', ?, ?, 1, 1)`).run(short, short)).toThrow(/CHECK/);
    expect(() => db.prepare(`INSERT INTO "profile" VALUES ('u2', ?, ?, 1, 1)`).run(long, long)).toThrow(/CHECK/);
  });
});

describe('representative listing queries', () => {
  // T0020-F1 will add text search; these are the visibility/skill/pagination shapes it builds on.
  const queries = {
    publicRecent: `SELECT id FROM "build" WHERE visibility = 'public' ORDER BY updated_at DESC, id DESC LIMIT 20`,
    publicByOwner: `SELECT id FROM "build" WHERE visibility = 'public' AND owner_user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 20`,
    ownLibrary: `SELECT id FROM "build" WHERE owner_user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 20`,
    // Recommended shape: one indexed branch per slot. A plain `(skill_a_id = ? OR skill_b_id = ?)`
    // filter makes SQLite walk build_public_recent_idx instead (see T0018 ADR, "Search").
    oneSkill: `SELECT id, updated_at FROM "build" WHERE visibility = 'public' AND skill_a_id = ?1
      UNION SELECT id, updated_at FROM "build" WHERE visibility = 'public' AND skill_b_id = ?1
      ORDER BY updated_at DESC, id DESC LIMIT 20`,
    bothSkills: `SELECT id, updated_at FROM "build" WHERE visibility = 'public' AND skill_a_id = ?1 AND skill_b_id = ?2
      UNION SELECT id, updated_at FROM "build" WHERE visibility = 'public' AND skill_a_id = ?2 AND skill_b_id = ?1
      ORDER BY updated_at DESC, id DESC LIMIT 20`,
    eitherSkill: `SELECT id, updated_at FROM "build" WHERE visibility = 'public' AND skill_a_id IN (?1, ?2)
      UNION SELECT id, updated_at FROM "build" WHERE visibility = 'public' AND skill_b_id IN (?1, ?2)
      ORDER BY updated_at DESC, id DESC LIMIT 20`,
  };

  function seed() {
    let t = 0;
    for (const [owner, visibility, a, b] of [
      ['u1', 'public', 'Cow', 'Unarmed'], ['u1', 'unlisted', 'Cow', 'Unarmed'], ['u1', 'private', 'Cow', 'Unarmed'],
      ['u2', 'public', 'Unarmed', 'Cow'], ['u2', 'public', 'Cow', 'Psychology'], ['u2', 'public', 'Deer', null],
    ] as const) addBuild({ owner_user_id: owner, visibility, skill_a_id: a, skill_b_id: b, updated_at: ++t });
  }

  it('never return non-public rows from public queries', () => {
    seed();
    const visibilityOf = (rows: Record<string, unknown>[]) => rows.map(r =>
      (db.prepare(`SELECT visibility FROM "build" WHERE id = ?`).get(r.id as string) as { visibility: string }).visibility);
    expect(new Set(visibilityOf(db.prepare(queries.publicRecent).all()))).toEqual(new Set(['public']));
    expect(db.prepare(queries.publicByOwner).all('u1')).toHaveLength(1);
    expect(db.prepare(queries.ownLibrary).all('u1')).toHaveLength(3);
    expect(db.prepare(queries.oneSkill).all('Unarmed')).toHaveLength(2);
    expect(db.prepare(queries.bothSkills).all('Cow', 'Unarmed')).toHaveLength(2);
    expect(db.prepare(queries.eitherSkill).all('Psychology', 'Deer')).toHaveLength(2);
    expect(db.prepare(`SELECT count(*) AS n FROM "build" WHERE visibility = 'public'`).get()).toEqual({ n: 4 });
  });

  it('use indexes rather than full table scans', () => {
    const plan = (sql: string, ...args: string[]) => db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args)
      .map(row => String(row.detail)).join(' | ');
    expect(plan(queries.publicRecent)).toMatch(/build_public_recent_idx/);
    expect(plan(queries.publicByOwner, 'u1')).toMatch(/build_public_owner_idx|build_owner_recent_idx/);
    expect(plan(queries.ownLibrary, 'u1')).toMatch(/build_owner_recent_idx/);
    for (const [sql, args] of [
      [queries.oneSkill, ['Cow']], [queries.bothSkills, ['Cow', 'Unarmed']], [queries.eitherSkill, ['Cow', 'Deer']],
    ] as const) {
      const detail = plan(sql, ...args);
      // Each UNION branch is an index SEARCH on a public-only skill index, never a scan.
      expect(detail.match(/SEARCH build USING (?:COVERING )?INDEX build_public_skill_[ab]_idx/g)).toHaveLength(2);
      expect(detail).not.toMatch(/SCAN build/);
    }
  });
});
