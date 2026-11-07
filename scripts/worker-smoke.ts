/**
 * T0018 local Worker + D1 smoke test. LOCAL ONLY: needs no Cloudflare account, credentials,
 * remote database or network access to Cloudflare.
 *
 *   npm run build && npm run worker:smoke          (add --keep to keep the temporary D1 state)
 *
 * 1. Applies the committed migrations to a fresh, temporary local D1 (`--env local --local
 *    --persist-to .wrangler/t0018-smoke/...`), re-applies them to prove idempotence and inspects
 *    the resulting schema and query plans through local D1.
 * 2. Starts the real Worker in workerd (`wrangler dev --env local`) and checks /api/health,
 *    JSON API 404/405, root, SPA deep links and real built assets.
 * 3. Starts the local-only Better Auth probe on its own temporary D1 and checks OAuth sign-in
 *    initiation, origin/callback protection and a D1-backed session round trip.
 * 4. Bundles the probe with `wrangler deploy --dry-run` to record its size (nothing uploaded).
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const WRANGLER = resolve(ROOT, 'node_modules/.bin/wrangler');
const STATE_ROOT = resolve(ROOT, '.wrangler/t0018-smoke', String(Date.now()));
const KEEP = process.argv.includes('--keep');
const MIGRATIONS = readdirSync(resolve(ROOT, 'migrations')).filter(file => file.endsWith('.sql')).sort();

/** Child processes never see Cloudflare credentials, so nothing here can reach a real account. */
const childEnv: NodeJS.ProcessEnv = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', NO_PROXY: '127.0.0.1,localhost' };
for (const key of Object.keys(childEnv)) {
  if (/^(CLOUDFLARE_|CF_)/.test(key) && key !== 'CLOUDFLARE_INCLUDE_PROCESS_ENV') delete childEnv[key];
}
process.env.NO_PROXY = childEnv.NO_PROXY;

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

function guardLocal(args: string[]): void {
  if (args.some(arg => arg === '--remote' || arg.startsWith('--remote='))) throw new Error('Refusing to run a remote command.');
  if (args[0] === 'd1' && !args.includes('--local')) throw new Error('D1 commands in this script must use --local.');
  if (args[0] === 'deploy' && !args.includes('--dry-run')) throw new Error('Deploys in this script must be dry runs.');
}

function wrangler(args: string[]): { status: number | null; output: string; stdout: string } {
  guardLocal(args);
  const run = spawnSync(WRANGLER, args, { cwd: ROOT, env: childEnv, encoding: 'utf8' });
  return { status: run.status, output: `${run.stdout}\n${run.stderr}`, stdout: run.stdout };
}

function d1Json(config: string[], persist: string, sql: string): Record<string, unknown>[] {
  const run = wrangler(['d1', 'execute', 'DB', ...config, '--local', '--persist-to', persist, '--json', '--command', sql]);
  if (run.status !== 0) throw new Error(`d1 execute failed:\n${run.output}`);
  const parsed = JSON.parse(run.stdout) as { results: Record<string, unknown>[] }[];
  return parsed.flatMap(batch => batch.results);
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => typeof address === 'object' && address ? resolvePort(address.port) : reject(new Error('no port')));
    });
  });
}

async function startDev(args: string[], readyPath: string, port?: number): Promise<{ origin: string; stop: () => void }> {
  port ??= await freePort();
  const fullArgs = ['dev', ...args, '--ip', '127.0.0.1', '--port', String(port), '--show-interactive-dev-session=false'];
  guardLocal(fullArgs);
  let log = '';
  const child: ChildProcess = spawn(WRANGLER, fullArgs, { cwd: ROOT, env: childEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout?.on('data', chunk => { log += String(chunk); });
  child.stderr?.on('data', chunk => { log += String(chunk); });
  const stop = () => { try { if (child.pid) process.kill(-child.pid, 'SIGTERM'); } catch { /* already exited */ } };
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) break;
    try { await fetch(`${origin}${readyPath}`); return { origin, stop }; }
    catch { await new Promise(r => setTimeout(r, 500)); }
  }
  stop();
  throw new Error(`wrangler dev did not start:\n${log}`);
}

const isJson = (response: Response) => (response.headers.get('content-type') ?? '').startsWith('application/json');
const isHtml = (response: Response) => (response.headers.get('content-type') ?? '').startsWith('text/html');

async function smokeMainWorker(): Promise<void> {
  console.log('\n== Local D1 migrations (env.local, --local, temporary persistence) ==');
  const persist = join(STATE_ROOT, 'main');
  mkdirSync(persist, { recursive: true });
  const env = ['--env', 'local'];
  const first = wrangler(['d1', 'migrations', 'apply', 'DB', ...env, '--local', '--persist-to', persist]);
  check('migrations apply to a fresh local D1', first.status === 0 && MIGRATIONS.every(file => first.output.includes(file)),
    MIGRATIONS.join(', '));
  const second = wrangler(['d1', 'migrations', 'apply', 'DB', ...env, '--local', '--persist-to', persist]);
  check('re-applying is a no-op', second.status === 0 && /No migrations to apply/i.test(second.output));
  const list = wrangler(['d1', 'migrations', 'list', 'DB', ...env, '--local', '--persist-to', persist]);
  check('migrations list reports nothing pending', list.status === 0 && /No migrations to apply/i.test(list.output));

  const tables = d1Json(env, persist, `SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite%' AND name <> 'd1_migrations' ORDER BY name`)
    .map(row => row.name);
  check('local D1 schema has auth, profile and build tables', JSON.stringify(tables) === JSON.stringify(['account', 'build', 'profile', 'session', 'user', 'verification']),
    tables.join(', '));
  const fk = d1Json(env, persist, 'PRAGMA foreign_keys');
  check('local D1 enforces foreign keys', fk[0]?.foreign_keys === 1);
  for (const [name, sql] of [
    ['public recent', `SELECT id FROM "build" WHERE visibility = 'public' ORDER BY updated_at DESC, id DESC LIMIT 20`],
    ['one skill (UNION)', `SELECT id, updated_at FROM "build" WHERE visibility = 'public' AND skill_a_id = 'Cow' UNION SELECT id, updated_at FROM "build" WHERE visibility = 'public' AND skill_b_id = 'Cow' ORDER BY updated_at DESC, id DESC LIMIT 20`],
  ] as const) {
    const plan = d1Json(env, persist, `EXPLAIN QUERY PLAN ${sql}`).map(row => row.detail).join(' | ');
    check(`local D1 query plan: ${name}`, /build_public_/.test(plan) && !/SCAN build(?! USING)/.test(plan), plan);
  }

  console.log('\n== Worker in workerd (wrangler dev --env local) ==');
  const dev = await startDev([...env, '--persist-to', persist], '/api/health');
  try {
    const health = await fetch(`${dev.origin}/api/health`);
    const body = await health.json() as Record<string, unknown>;
    check('GET /api/health is 200 with a real local D1 query', health.status === 200 && isJson(health)
      && body.status === 'ok' && body.database === 'ok' && body.environment === 'local', JSON.stringify(body));
    check('API responses are not cacheable', health.headers.get('cache-control') === 'no-store');
    const head = await fetch(`${dev.origin}/api/health`, { method: 'HEAD' });
    check('HEAD /api/health is 200 without a body', head.status === 200 && (await head.text()) === '');
    const post = await fetch(`${dev.origin}/api/health`, { method: 'POST' });
    check('POST /api/health is a JSON 405', post.status === 405 && isJson(post) && post.headers.get('allow') === 'GET, HEAD');
    for (const path of ['/api', '/api/', '/api/unknown', '/api/builds/AAAAAAAAAAAAAAAA', '/api/auth/session']) {
      for (const headers of [{}, { 'sec-fetch-mode': 'navigate', accept: 'text/html' }] as Record<string, string>[]) {
        const response = await fetch(`${dev.origin}${path}`, { headers });
        const text = await response.text();
        check(`${path}${'accept' in headers ? ' (browser navigation)' : ''} is a JSON 404, not SPA HTML`,
          response.status === 404 && isJson(response) && !/<html/i.test(text), `${response.status} ${response.headers.get('content-type')}`);
      }
    }
    const index = readFileSync(resolve(ROOT, 'dist/index.html'), 'utf8');
    const root = await fetch(`${dev.origin}/`);
    check('GET / serves the built SPA', root.status === 200 && isHtml(root) && (await root.text()) === index);
    for (const path of ['/builds/some-shared-id', '/search?skill=Cow', '/apix']) {
      const response = await fetch(`${dev.origin}${path}`, { headers: { 'sec-fetch-mode': 'navigate', accept: 'text/html' } });
      check(`SPA deep link ${path} falls back to index.html`, response.status === 200 && isHtml(response) && (await response.text()) === index);
    }
    const assets = readdirSync(resolve(ROOT, 'dist/assets'));
    const script = assets.find(file => /^index-.*\.js$/.test(file));
    const gzip = assets.find(file => file.endsWith('.gz'));
    if (script) {
      const response = await fetch(`${dev.origin}/assets/${script}`);
      check('built JS asset is served unchanged', response.status === 200
        && /javascript/.test(response.headers.get('content-type') ?? '')
        && (await response.text()) === readFileSync(resolve(ROOT, 'dist/assets', script), 'utf8'), script);
    } else check('built JS asset exists', false);
    if (gzip) {
      const response = await fetch(`${dev.origin}/assets/${gzip}`, { headers: { 'accept-encoding': 'identity' } });
      const bytes = new Uint8Array(await response.arrayBuffer());
      check('compressed game-data asset is served', response.status === 200 && bytes.byteLength > 0, `${gzip} ${bytes.byteLength} bytes`);
    }
  } finally { dev.stop(); }
}

async function smokeAuthProbe(): Promise<void> {
  console.log('\n== Better Auth feasibility probe (local-only Worker, own local D1) ==');
  const persist = join(STATE_ROOT, 'auth-probe');
  mkdirSync(persist, { recursive: true });
  const config = ['--config', 'worker/auth-probe/wrangler.jsonc'];
  const migrated = wrangler(['d1', 'migrations', 'apply', 'DB', ...config, '--local', '--persist-to', persist]);
  check('probe database migrated from the committed migrations', migrated.status === 0);

  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  // The probe's PROBE_ORIGIN must match its port, so the port is chosen first.
  const dev = await startDev([...config, '--persist-to', persist, '--var', `PROBE_ORIGIN:${origin}`], '/api/auth/ok', port);
  const counts = async () => (await (await fetch(`${origin}/__probe/counts`)).json()) as Record<string, number>;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try {
    const okResponse = await fetch(`${origin}/api/auth/ok`);
    check('Better Auth initializes in workerd with native D1', okResponse.status === 200 && JSON.stringify(await okResponse.json()) === '{"ok":true}');
    const anonymous = await fetch(`${origin}/api/auth/get-session`);
    check('no cookie means no session', anonymous.status === 200 && (await anonymous.text()) === 'null');

    for (const [provider, host] of [['discord', 'https://discord.com/'], ['google', 'https://accounts.google.com/']] as const) {
      const before = await counts();
      const start = await post('/api/auth/sign-in/social', { provider, callbackURL: '/' }, { origin });
      const body = await start.json() as { url?: string; redirect?: boolean };
      const cookie = start.headers.get('set-cookie') ?? '';
      const after = await counts();
      check(`${provider} sign-in initiation returns a provider redirect`, start.status === 200 && body.redirect === true
        && (body.url ?? '').startsWith(host) && (body.url ?? '').includes(encodeURIComponent(`${origin}/api/auth/callback/${provider}`)));
      check(`${provider} OAuth state cookie is HttpOnly + SameSite=Lax`, /better-auth\.state=/.test(cookie) && /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie));
      check(`${provider} OAuth state is written to D1`, (after.verifications ?? 0) === (before.verifications ?? 0) + 1);
    }
    const evilCallback = await post('/api/auth/sign-in/social', { provider: 'discord', callbackURL: 'https://evil.example/steal' }, { origin });
    check('foreign callbackURL is rejected', evilCallback.status >= 400 && /INVALID_CALLBACK_URL/.test(await evilCallback.text()));

    const created = await (await post('/__probe/session', {})).json() as { userId: string; cookie: string };
    const withCookie = { cookie: created.cookie };
    const session = await (await fetch(`${origin}/api/auth/get-session`, { headers: withCookie })).json() as { user?: { id?: string } } | null;
    check('signed session cookie validates against the D1 session row', session?.user?.id === created.userId);

    const crossSite = await post('/api/auth/sign-out', {}, { ...withCookie, origin: 'https://evil.example' });
    check('cross-origin sign-out with a cookie is rejected (CSRF)', crossSite.status === 403 && /INVALID_ORIGIN/.test(await crossSite.text()));
    const noOrigin = await post('/api/auth/sign-out', {}, withCookie);
    check('cookie-bearing POST without Origin is rejected', noOrigin.status === 403);
    const form = await fetch(`${origin}/api/auth/sign-out`, {
      method: 'POST', headers: { ...withCookie, origin, 'content-type': 'application/x-www-form-urlencoded' }, body: 'x=1',
    });
    check('form-encoded (simple CORS) POST is rejected', form.status === 415 || form.status === 403, String(form.status));
    const stillValid = await (await fetch(`${origin}/api/auth/get-session`, { headers: withCookie })).json() as { user?: { id?: string } } | null;
    check('rejected requests did not end the session', stillValid?.user?.id === created.userId);

    const sessionsBefore = (await counts()).sessions ?? 0;
    const signOut = await post('/api/auth/sign-out', {}, { ...withCookie, origin });
    const cleared = signOut.headers.get('set-cookie') ?? '';
    check('same-origin sign-out succeeds and clears the cookie', signOut.status === 200 && /better-auth\.session_token=;/.test(cleared) && /Max-Age=0/i.test(cleared));
    const revoked = await fetch(`${origin}/api/auth/get-session`, { headers: withCookie });
    check('signed-out session is revoked in D1', (await revoked.text()) === 'null' && (await counts()).sessions === sessionsBefore - 1);
  } finally { dev.stop(); }

  const outdir = join(STATE_ROOT, 'auth-probe-bundle');
  const dryRun = wrangler(['deploy', ...config, '--dry-run', '--outdir', outdir]);
  const size = /Total Upload: ([^\n]+)/.exec(dryRun.output)?.[1]?.trim() ?? 'unknown';
  check('Better Auth probe bundles for Workers (dry run, not uploaded)', dryRun.status === 0, size);
}

async function main(): Promise<void> {
  if (!existsSync(resolve(ROOT, 'dist/index.html')) || !statSync(resolve(ROOT, 'dist/assets')).isDirectory()) {
    console.error('dist/ is missing. Run `npm run build` first.');
    process.exit(2);
  }
  if (!existsSync(WRANGLER)) {
    console.error('Wrangler is not installed. Run `npm ci` first.');
    process.exit(2);
  }
  mkdirSync(STATE_ROOT, { recursive: true });
  try {
    await smokeMainWorker();
    await smokeAuthProbe();
  } catch (error) {
    check('smoke run completed', false, error instanceof Error ? error.message : String(error));
  } finally {
    if (!KEEP) rmSync(STATE_ROOT, { recursive: true, force: true });
  }
  const failed = results.filter(result => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} local smoke checks passed${KEEP ? ` (state kept in ${STATE_ROOT})` : ''}.`);
  if (failed.length) process.exit(1);
}

await main();
