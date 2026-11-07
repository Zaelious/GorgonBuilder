// @vitest-environment node
/**
 * Auth schema drift guard: after applying every committed migration, Better Auth (pinned
 * version, T0019 option set) must find no table or column left to create. If a Better Auth
 * upgrade or option change needs schema changes, this fails until a new migration is added.
 */
import { DatabaseSync } from 'node:sqlite';
import { getMigrations } from 'better-auth/db/migration';
import { describe, expect, it } from 'vitest';
import { applyMigrations } from '../testing/sqlite-migrations';
import { createAuthOptions } from './auth-options';

const inert = { clientId: 'test-placeholder', clientSecret: 'test-placeholder' };
const options = (database: DatabaseSync) => createAuthOptions({
  database, baseURL: 'http://127.0.0.1:8798', secret: 'schema-test-only-not-a-secret-0000000000', discord: inert, google: inert,
});

describe('Better Auth schema compatibility', () => {
  it('needs nothing beyond the committed migrations', async () => {
    const db = new DatabaseSync(':memory:');
    applyMigrations(db);
    const { toBeCreated, toBeAdded } = await getMigrations(options(db));
    expect(toBeCreated).toEqual([]);
    expect(toBeAdded).toEqual([]);
  });

  it('owns exactly the user, session, account and verification tables', async () => {
    const { toBeCreated } = await getMigrations(options(new DatabaseSync(':memory:')));
    expect(toBeCreated.map(table => table.table).sort()).toEqual(['account', 'session', 'user', 'verification']);
  });

  it('keeps OAuth-only configuration without a password flow', () => {
    const configured = options(new DatabaseSync(':memory:'));
    expect(configured.emailAndPassword.enabled).toBe(false);
    expect(Object.keys(configured.socialProviders).sort()).toEqual(['discord', 'google']);
    expect(configured.basePath).toBe('/api/auth');
    expect(configured.trustedOrigins).toEqual(['http://127.0.0.1:8798']);
    expect(configured.telemetry.enabled).toBe(false);
    expect(createAuthOptions({ ...configured, discord: inert, google: inert, baseURL: 'https://gorgonbuilder.example' })
      .advanced.useSecureCookies).toBe(true);
  });
});
