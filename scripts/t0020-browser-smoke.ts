/**
 * T0020 real-browser account journey. LOCAL ONLY: no Cloudflare account, credentials, remote
 * database or OAuth provider is contacted.
 *
 *   npm run build && node scripts/t0020-browser-smoke.ts [--screenshots]
 *
 * 1. Applies the committed migrations to a fresh temporary local D1.
 * 2. Seeds three local test accounts with signed Better Auth sessions (stand-ins for a completed
 *    OAuth consent; genuine Google/Discord sign-in is an owner staging check). The signing
 *    secret and provider IDs are random/placeholder values generated for this run only.
 * 3. Starts the real Worker (`wrangler dev --env local`) serving the built SPA, plus a second
 *    instance with accounts unconfigured (the production/PR-preview shape).
 * 4. Drives Chromium (Playwright from the environment; not a project dependency) through
 *    guest → username → save → change → share → read-only guest view → revoke → copy, at
 *    1440, 375 and 320 px, checking for horizontal overflow and page errors.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';

/** The few Playwright members used here. Playwright is provided by the environment, not a dependency. */
interface Locator {
  count(): Promise<number>; textContent(): Promise<string | null>; click(): Promise<void>; blur(): Promise<void>;
  getAttribute(name: string): Promise<string | null>; first(): Locator; getByRole(role: 'button', options: { name: string | RegExp; exact?: boolean }): Locator;
}
interface Page {
  on(event: 'pageerror', listener: (error: Error) => void): void;
  on(event: 'console', listener: (message: { type(): string; text(): string }) => void): void;
  goto(url: string): Promise<unknown>; reload(): Promise<unknown>; url(): string; waitForSelector(selector: string): Promise<unknown>; waitForTimeout(ms: number): Promise<void>;
  locator(selector: string): Locator; getByRole: Locator['getByRole']; click(selector: string): Promise<void>; fill(selector: string, value: string): Promise<void>;
  check(selector: string): Promise<void>; isChecked(selector: string): Promise<boolean>; isDisabled(selector: string): Promise<boolean>;
  inputValue(selector: string): Promise<string>; selectOption(selector: string, value: string): Promise<unknown>;
  evaluate<T>(fn: () => T): Promise<T>; keyboard: { press(key: string): Promise<void> }; screenshot(options: { path: string; fullPage: boolean; type: 'jpeg'; quality: number }): Promise<unknown>;
}
interface BrowserContext {
  newPage(): Promise<Page>; close(): Promise<void>;
  addCookies(cookies: { name: string; value: string; url: string; httpOnly: boolean; sameSite: 'Lax' }[]): Promise<void>;
}
interface Browser { newContext(options: Record<string, unknown>): Promise<BrowserContext>; close(): Promise<void> }

const ROOT = resolve(import.meta.dirname, '..');
const WRANGLER = resolve(ROOT, 'node_modules/.bin/wrangler');
const STATE = resolve(ROOT, '.wrangler/t0020-browser', String(Date.now()));
const SHOTS = resolve(ROOT, 'docs/screenshots/t0020');
const SAVE_SHOTS = process.argv.includes('--screenshots');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright') as { chromium: { launch(): Promise<Browser> } };

const childEnv: NodeJS.ProcessEnv = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', NO_PROXY: '127.0.0.1,localhost' };
for (const key of Object.keys(childEnv)) if (/^(CLOUDFLARE_|CF_)/.test(key)) delete childEnv[key];
process.env.NO_PROXY = childEnv.NO_PROXY;

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}
function wrangler(args: string[]) {
  if (args.includes('--remote') || (args[0] === 'd1' && !args.includes('--local'))) throw new Error('Refusing a non-local command.');
  const run = spawnSync(WRANGLER, args, { cwd: ROOT, env: childEnv, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`wrangler ${args.join(' ')} failed:\n${run.stdout}\n${run.stderr}`);
  return run.stdout;
}
const sql = (command: string) => wrangler(['d1', 'execute', 'DB', '--env', 'local', '--local', '--persist-to', STATE, '--command', command]);
async function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => { const address = server.address(); server.close(() => typeof address === 'object' && address ? done(address.port) : fail(new Error('no port'))); });
  });
}
async function startWorker(vars: Record<string, string>): Promise<{ origin: string; stop: () => void }> {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const args = ['dev', '--env', 'local', '--persist-to', STATE, '--ip', '127.0.0.1', '--port', String(port), '--show-interactive-dev-session=false',
    ...Object.entries({ ...vars, ...(vars.BETTER_AUTH_SECRET ? { APP_ORIGIN: origin } : {}) }).flatMap(([key, value]) => ['--var', `${key}:${value}`])];
  const child: ChildProcess = spawn(WRANGLER, args, { cwd: ROOT, env: childEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout?.on('data', chunk => { log += String(chunk); });
  child.stderr?.on('data', chunk => { log += String(chunk); });
  const stop = () => { try { if (child.pid) process.kill(-child.pid, 'SIGTERM'); } catch { /* exited */ } };
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) break;
    try { await fetch(`${origin}/api/health`); return { origin, stop }; } catch { await new Promise(r => setTimeout(r, 500)); }
  }
  stop();
  throw new Error(`wrangler dev did not start:\n${log}`);
}

/** Better Auth signed-cookie format: `${token}.${base64(HMAC-SHA256(secret, token))}`. */
function seedAccount(secret: string, label: string, username: string | null): string {
  const id = randomUUID(); const token = randomBytes(24).toString('base64url'); const now = new Date().toISOString();
  const expires = new Date(Date.now() + 3600_000).toISOString();
  sql(`INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES ('${id}','Local ${label}','${label}@example.invalid',1,'${now}','${now}');
    INSERT INTO "session"(id,expiresAt,token,createdAt,updatedAt,userId) VALUES ('${randomUUID()}','${expires}','${token}','${now}','${now}','${id}');
    ${username ? `INSERT INTO profile(user_id,username,username_normalized,created_at,updated_at) VALUES ('${id}','${username}','${username.toLowerCase()}',${Date.now()},${Date.now()});` : ''}`);
  return `${token}.${createHmac('sha256', secret).update(token).digest('base64')}`;
}

async function context(browser: Browser, origin: string, cookie: string | null, viewport: { width: number; height: number }): Promise<BrowserContext> {
  const created = await browser.newContext({ viewport, deviceScaleFactor: SAVE_SHOTS ? 2 : 1, ...(viewport.width < 500 ? { isMobile: true, hasTouch: true } : {}) });
  if (cookie) await created.addCookies([{ name: 'better-auth.session_token', value: encodeURIComponent(cookie), url: origin, httpOnly: true, sameSite: 'Lax' }]);
  return created;
}
const errors: string[] = [];
async function open(ctx: BrowserContext, url: string): Promise<Page> {
  const page = await ctx.newPage();
  page.on('pageerror', error => errors.push(`${url}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error' && !/status of (401|404|409|503)/.test(message.text())) errors.push(`${url}: ${message.text()}`); });
  await page.goto(url);
  await page.waitForSelector('.planner-heading, .notice, .page-section');
  return page;
}
async function noOverflow(page: Page, name: string) {
  const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  check(`${name}: no horizontal overflow`, scroll <= width, `${scroll} <= ${width}`);
}
async function shot(page: Page, name: string, fullPage = false) {
  if (!SAVE_SHOTS) return;
  await page.screenshot({ path: join(SHOTS, `${name}.jpg`), fullPage, type: 'jpeg', quality: 72 });
}
const selectSkill = async (page: Page, slot: 'A' | 'B', skill: string) => { await page.selectOption(`#skill-${slot}`, skill); };

async function main() {
  if (!existsSync(resolve(ROOT, 'dist/index.html'))) throw new Error('Run `npm run build` first.');
  mkdirSync(STATE, { recursive: true });
  if (SAVE_SHOTS) mkdirSync(SHOTS, { recursive: true });
  wrangler(['d1', 'migrations', 'apply', 'DB', '--env', 'local', '--local', '--persist-to', STATE]);
  const secret = randomBytes(32).toString('hex');
  const moo = seedAccount(secret, 'moo', 'MooTank');
  const deer = seedAccount(secret, 'deer', 'DeerSage');
  const fresh = seedAccount(secret, 'fresh', null);
  const accounts = await startWorker({ BETTER_AUTH_SECRET: secret, DISCORD_CLIENT_ID: 'local-placeholder', DISCORD_CLIENT_SECRET: 'local-placeholder',
    GOOGLE_CLIENT_ID: 'local-placeholder', GOOGLE_CLIENT_SECRET: 'local-placeholder' });
  const plain = await startWorker({});
  const browser = await chromium.launch();
  const desktop = { width: 1440, height: 900 };
  try {
    // Production / PR-preview shape: the account API answers 503 not_configured.
    const prod = await open(await context(browser, plain.origin, null, desktop), plain.origin);
    await prod.waitForSelector('#skill-A');
    check('unconfigured deployment: no nav, no cloud save, original Save', await prod.locator('.app-nav').count() === 0 &&
      await prod.locator('.cloud-save').count() === 0 && (await prod.locator('.save-draft').textContent())?.trim() === 'Save');
    await shot(prod, '01-production-guest-planner-1440');

    // Guest on the account-enabled deployment.
    const guestCtx = await context(browser, accounts.origin, null, desktop);
    const guest = await open(guestCtx, accounts.origin);
    await guest.waitForSelector('.sign-in-button');
    await selectSkill(guest, 'A', 'Cow'); await selectSkill(guest, 'B', 'Unarmed');
    check('guest: default title follows the skill pair', (await guest.locator('.title-button').textContent())?.trim() === 'Cow/Unarmed');
    await shot(guest, '02-guest-planner-1440');
    await guest.click('.cloud-save');
    await guest.waitForSelector('#sign-in-title');
    check('guest: Save build opens provider sign-in', await guest.locator('.provider-button').count() === 2);
    await shot(guest, '03-guest-sign-in-dialog-1440');
    await guest.keyboard.press('Escape');

    // New account: username onboarding.
    const freshPage = await open(await context(browser, accounts.origin, fresh, desktop), accounts.origin);
    await freshPage.waitForSelector('#username-input');
    check('new account: username field is empty (no template)', await freshPage.inputValue('#username-input') === '');
    await freshPage.fill('#username-input', 'NewMoo');
    await shot(freshPage, '04-choose-username-1440');
    await freshPage.click('.account-form button[type=submit]');
    await freshPage.waitForSelector('text=cannot currently be changed');
    await shot(freshPage, '05-confirm-username-1440');
    await freshPage.click('text=Confirm “NewMoo”');
    await freshPage.waitForSelector('.account-name:has-text("NewMoo")');
    check('new account: username confirmed through the real API', true);
    await freshPage.goto(`${accounts.origin}/my-builds`);
    await freshPage.waitForSelector('text=No saved builds yet');
    await shot(freshPage, '06-my-builds-empty-1440');

    // Owner journey.
    const mooCtx = await context(browser, accounts.origin, moo, desktop);
    const owner = await open(mooCtx, accounts.origin);
    await owner.waitForSelector('.account-name');
    await selectSkill(owner, 'A', 'Cow'); await selectSkill(owner, 'B', 'Unarmed');
    await owner.fill('#level-A', '90'); await owner.fill('#level-B', '85'); await owner.locator('#level-B').blur();
    await owner.click('.cloud-save');
    await owner.waitForSelector('#save-build-title');
    check('save dialog: Private default and generated title', await owner.isChecked('input[name=save-visibility][value=private]') && await owner.inputValue('#save-title') === 'Cow/Unarmed');
    await owner.fill('#save-description', 'Stampede tank for group content.');
    await shot(owner, '07-save-build-dialog-1440');
    await owner.click('.account-form button[type=submit]');
    await owner.waitForSelector('#cloud-status:has-text("All changes saved")');
    await shot(owner, '08-signed-in-saved-1440');
    await owner.fill('#level-A', '95'); await owner.locator('#level-A').blur();
    await owner.waitForSelector('#cloud-status:has-text("Unsaved changes")');
    await shot(owner, '09-unsaved-changes-1440');
    await owner.getByRole('button', { name: 'Save changes', exact: true }).click();
    await owner.waitForSelector('#cloud-status:has-text("All changes saved")');
    check('owner: Save changes persisted through the real API', true);
    const buildUrl = await owner.locator('#cloud-status a').getAttribute('href');

    await owner.getByRole('button', { name: 'Share', exact: true }).click();
    await owner.check('input[name=visibility][value=unlisted]');
    await owner.waitForSelector('.publication-review');
    await shot(owner, '10-share-review-1440');
    await owner.check('.review-confirm input');
    await owner.getByRole('button', { name: 'Save sharing settings', exact: true }).click();
    await owner.waitForSelector('#share-link-input');
    const link = await owner.inputValue('#share-link-input');
    check('share: Unlisted link uses /builds/:id', link === `${accounts.origin}${buildUrl}`, link);
    await shot(owner, '11-share-link-1440');
    await owner.getByRole('button', { name: 'Done', exact: true }).click();

    for (const title of ['Deer/Psychology Healer', 'Cow/Psychology Burst']) {
      await owner.getByRole('button', { name: 'Save as new', exact: true }).click();
      await owner.fill('#save-title', title);
      await owner.click('.account-form button[type=submit]');
      await owner.waitForSelector('#cloud-status:has-text("All changes saved")');
    }
    await owner.click('.app-nav a[href="/my-builds"]');
    await owner.waitForSelector('.build-row');
    check('My Builds lists three owned builds', await owner.locator('.build-row').count() === 3);
    await shot(owner, '12-my-builds-1440');

    // Guest reads the Unlisted build read-only without touching their own draft.
    const before = await guest.evaluate(() => localStorage.getItem('gorgonbuilder.current-draft'));
    const shared = await open(guestCtx, link);
    await shared.waitForSelector('#shared-build-title');
    check('guest: read-only shared planner, no edit controls', await shared.isDisabled('#skill-A') &&
      await shared.locator('text=Edit in planner').count() === 0 && await shared.locator('text=Sign in to copy').count() === 1);
    await shared.waitForTimeout(800);
    check('guest: viewing a share never changes the local draft', await shared.evaluate(() => localStorage.getItem('gorgonbuilder.current-draft')) === before);
    await shot(shared, '13-guest-read-only-shared-1440');

    // Another account copies; then the owner revokes.
    const deerCtx = await context(browser, accounts.origin, deer, desktop);
    const other = await open(deerCtx, link);
    await other.getByRole('button', { name: 'Copy to My Builds', exact: true }).click();
    await other.waitForSelector('text=Copied to My Builds as a Private build');
    await other.waitForSelector('button:has-text("Edit in planner")');
    check('other account: copy is a new Private build it owns', other.url() !== link && await other.locator('text=Edit in planner').count() === 1);
    await shot(other, '14-copied-private-build-1440');

    await owner.goto(`${accounts.origin}${buildUrl}`);
    await owner.getByRole('button', { name: 'Share', exact: true }).click();
    await owner.check('input[name=visibility][value=private]');
    await owner.getByRole('button', { name: 'Save sharing settings', exact: true }).click();
    await owner.waitForSelector('text=shared links no longer work');
    await shared.reload();
    await shared.waitForSelector('text=Build not available');
    check('revoked to Private: the old link no longer opens for guests', true);
    await shot(shared, '15-revoked-not-available-1440');

    // Mobile layouts.
    for (const width of [375, 320]) {
      const mobile = await context(browser, accounts.origin, moo, { width, height: 780 });
      const planner = await open(mobile, accounts.origin);
      await planner.waitForSelector('#cloud-status');
      await noOverflow(planner, `${width}px planner`);
      await shot(planner, `16-mobile-planner-${width}`);
      const list = await open(mobile, `${accounts.origin}/my-builds`);
      await list.waitForSelector('.build-row');
      await noOverflow(list, `${width}px My Builds`);
      await shot(list, `17-mobile-my-builds-${width}`);
      await list.locator('.build-row').first().getByRole('button', { name: /^Share / }).click();
      await list.waitForSelector('#share-title');
      await noOverflow(list, `${width}px share dialog`);
      await shot(list, `18-mobile-share-${width}`);
      const readOnly = await open(await context(browser, accounts.origin, deer, { width, height: 780 }), `${accounts.origin}/u/MooTank`);
      await readOnly.waitForSelector('#author-title');
      await noOverflow(readOnly, `${width}px public profile`);
      await mobile.close();
    }
    check('no page errors or unexpected console errors', errors.length === 0, errors.join(' | '));
  } finally {
    await browser.close();
    accounts.stop(); plain.stop();
    rmSync(STATE, { recursive: true, force: true });
  }
  const failed = results.filter(result => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) process.exit(1);
}

main().catch(error => { console.error(error); process.exit(1); });
