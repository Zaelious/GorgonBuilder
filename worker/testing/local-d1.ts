/** Test-only native D1 in local workerd through Wrangler. Remote bindings explicitly disabled. */
import { readFileSync } from 'node:fs';
import { getPlatformProxy, unstable_splitSqlQuery } from 'wrangler';
import type { BuildDatabase } from '../../src/persistence/remote/d1';
import { migrationFiles } from './sqlite-migrations';

export async function localD1() {
  const platform = await getPlatformProxy<{ DB: BuildDatabase }>({
    configPath: 'wrangler.jsonc', environment: 'local', persist: false, remoteBindings: false, envFiles: [],
  });
  const db = platform.env.DB;
  for (const file of migrationFiles()) {
    const statements = unstable_splitSqlQuery(readFileSync(`migrations/${file}`, 'utf8'));
    await db.batch(statements.map(sql => db.prepare(sql)));
  }
  return { db, dispose: platform.dispose };
}
export async function resetD1(db: BuildDatabase) {
  await db.batch(['DELETE FROM "user"', 'DELETE FROM verification', 'DELETE FROM api_rate_limit'].map(sql => db.prepare(sql)));
}
export async function seedUser(db: BuildDatabase, id: string) {
  await db.prepare(`INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,?,?)`)
    .bind(id, 'Private provider name', `${id}@example.invalid`, Date.now(), Date.now()).run();
}
