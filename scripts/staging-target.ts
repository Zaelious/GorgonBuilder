/** Read-only target guard for the manual workflow; never creates resources or sets secrets. */
import assert from 'node:assert/strict';
import { unstable_readConfig } from 'wrangler';
const production = unstable_readConfig({ config: 'wrangler.jsonc' }, { hideWarnings: true });
const staging = unstable_readConfig({ config: 'wrangler.jsonc', env: 'staging' }, { hideWarnings: true });
assert.equal(staging.name, 'gorgonbuilder-staging');
assert.equal(staging.vars.APP_ENV, 'staging');
assert.deepEqual(staging.d1_databases, [{ binding: 'DB', database_name: 'gorgonbuilder-staging',
  database_id: '477e9b46-bb96-4eca-a5ed-1ee57185fb2a', migrations_dir: 'migrations' }]);
assert.deepEqual(production.d1_databases, []);
assert.deepEqual(production.previews?.d1_databases, []);
assert.deepEqual(production.previews?.vars, { APP_ENV: 'preview' });
console.log('Verified staging Worker gorgonbuilder-staging; DB 477e9b46-bb96-4eca-a5ed-1ee57185fb2a; production and previews unbound.');
