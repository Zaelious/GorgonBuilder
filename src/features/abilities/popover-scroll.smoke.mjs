/*
 * T0014 acceptance: real-browser regression for ability-popover scrolling.
 *
 * Usage (Chromium + Node Playwright available, e.g. the global `playwright` package):
 *   node src/features/abilities/popover-scroll.smoke.mjs [--url http://127.0.0.1:5173/] [--output <dir>]
 * Without --url it starts the Vite dev server itself. Synthetic data only; no customer exports.
 *
 * For each viewport (1440×900, 1920×1080, 375×812, 320×812) it opens Mock 11 with Damage analysis on, expands the
 * damage breakdown, Technical details and Edit bar, then scrolls the card with the mouse wheel and checks that:
 * - scrolling moves forward (never resets to the top) and reaches the bottom;
 * - the Remove action at the bottom is visible and is the element under its own center;
 * - a later page scroll re-places the card without losing its internal scroll position;
 * - Escape still closes the card.
 * Screenshots of compact and expanded/scrolled states are written to --output.
 */
/* global process, console, setTimeout, fetch, document, window, innerHeight, localStorage, sessionStorage */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright is a machine tool here, not a project dependency: resolve it like `require` (honours NODE_PATH).
const { chromium } = createRequire(import.meta.url)('playwright');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) =>
  value.startsWith('--') ? [...pairs, [value.slice(2), all[index + 1]]] : pairs, []));
const output = path.resolve(args.output ?? 'popover-scroll-output');
fs.mkdirSync(output, { recursive: true });
const repo = path.resolve(__dirname, '../../..');

const DRAFT_KEY = 'gorgonbuilder.current-draft';
const db = (slot, itemId, candidateMods = []) => ({ slot, item: { kind: 'database', itemId }, candidateMods, sparks: { mode: 'none' } });
/** Psychology + Deer, Mock 11, many Mock-relevant planned mods and several unmodeled effects (long breakdown). */
const draft = {
  schemaVersion: 1, gameDataVersion: 'v490', title: 'Popover scroll regression', notes: '',
  skillSlotA: { skillId: 'Psychology', level: 100 }, skillSlotB: { skillId: 'Deer', level: 100 },
  abilityBarA: [{ abilityId: 'ability_6553', rank: null }], abilityBarB: [],
  equipment: [
    db('Head', 'item_44346', [{ powerId: 'power_4001', tierId: 'id_9' }]),
    db('Chest', 'item_42702', [{ powerId: 'power_4009', tierId: 'id_9' }]),
    db('Ring', 'item_49120'),
    db('Necklace', 'item_48082', [{ powerId: 'power_4066', tierId: 'id_20' }, { powerId: 'power_4066', tierId: 'id_19' }, { powerId: 'power_4002', tierId: 'id_9' }]),
    db('OffHand', 'item_45756', [{ powerId: 'power_4066', tierId: 'id_20' }, { powerId: 'power_4066', tierId: 'id_18' }]),
    db('Hands', 'item_43092', [{ powerId: 'power_4032', tierId: 'id_18' }]),
  ],
  target: { count: 9, damageTypes: { Psychic: { vulnerability: 10 } } },
};
const VIEWPORTS = [[1440, 900], [1920, 1080], [375, 812], [320, 812]];

async function startServer() {
  if (args.url) return { url: args.url, stop() {} };
  const port = 5191;
  const child = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: repo, stdio: 'ignore', detached: true });
  const url = `http://127.0.0.1:${port}/`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(url)).ok) return { url, stop: () => process.kill(-child.pid) }; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  process.kill(-child.pid);
  throw new Error('Vite dev server did not start');
}

function assert(condition, message) { if (!condition) throw new Error(message); }

async function run(browser, url, [width, height]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(([key, value]) => {
    if (sessionStorage.getItem('smoke-seeded')) return;
    localStorage.setItem(key, value);
    sessionStorage.setItem('gorgonbuilder.session.damage-analysis', '1');
    sessionStorage.setItem('smoke-seeded', '1');
  }, [DRAFT_KEY, JSON.stringify(draft)]);
  await page.goto(url);
  const slot = page.locator('.skill-panel:nth-child(1) .combat-slot:nth-child(1) .slot-button');
  await slot.click();
  const card = page.locator('.ability-popover');
  await card.waitFor();
  await page.waitForTimeout(150);
  const name = `${width}x${height}`;
  await page.screenshot({ path: path.join(output, `${name}-compact.png`) });

  // T0010-F2 split the public Damage breakdown from the debug-only Calculation breakdown/Technical details; expand
  // every disclosure that exists in the current mode (public, or dev with ?debugDamage=1).
  for (const summary of ['.damage-breakdown > summary', '.calc-breakdown:not(.damage-breakdown) > summary', '.technical-details > summary', '.bar-edit-actions > summary']) {
    if (await card.locator(summary).count() === 0) continue;
    await card.locator(summary).click();
    await page.waitForTimeout(80);
  }
  const metrics = () => card.evaluate(element => ({ top: element.scrollTop, client: element.clientHeight, height: element.scrollHeight,
    fit: element.dataset.fit, rect: element.getBoundingClientRect().toJSON() }));
  const start = await metrics();
  assert(start.height > start.client, `${name}: expanded content (${start.height}px) should exceed the card (${start.client}px) to test scrolling`);
  assert(start.rect.bottom <= height + 1 && start.rect.top >= -1, `${name}: card must stay inside the viewport`);
  await page.screenshot({ path: path.join(output, `${name}-expanded-top.png`) });

  // Wheel inside the card: every step moves forward; nothing snaps back to the top.
  const box = await card.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 200));
  let previous = start.top;
  for (let step = 0; step < 80; step += 1) {
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(40);
    const current = await metrics();
    assert(current.top >= previous, `${name}: internal scroll went backwards (${previous} → ${current.top}) at wheel ${step}`);
    previous = current.top;
    if (current.top + current.client >= current.height - 1) break;
  }
  const bottom = await metrics();
  assert(bottom.top > 0 && bottom.top + bottom.client >= bottom.height - 1, `${name}: bottom not reached (${bottom.top}+${bottom.client}/${bottom.height})`);
  await page.waitForTimeout(250);
  assert((await metrics()).top === bottom.top, `${name}: scroll position reset after scrolling stopped`);

  // The last action is reachable and actually hit-testable.
  const remove = card.locator('.remove-ability');
  const rect = await remove.boundingBox();
  assert(rect && rect.y >= 0 && rect.y + rect.height <= height, `${name}: Remove is outside the viewport`);
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.remove-ability') !== null, [rect.x + rect.width / 2, rect.y + rect.height / 2]);
  assert(hit, `${name}: Remove is covered`);
  await page.screenshot({ path: path.join(output, `${name}-expanded-bottom.png`) });

  // Page scrolling outside the card re-places it but keeps its own scroll position.
  const pageScrollable = await page.evaluate(() => document.scrollingElement.scrollHeight > innerHeight);
  if (pageScrollable) {
    await page.evaluate(() => window.scrollBy(0, 40));
    await page.waitForTimeout(120);
    const after = await metrics();
    assert(after.top === bottom.top, `${name}: page scroll reset the card's internal scroll (${bottom.top} → ${after.top})`);
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  assert(await card.count() === 0, `${name}: Escape did not close the card`);
  assert(errors.length === 0, `${name}: page errors ${errors.join('; ')}`);
  await page.close();
  return { viewport: name, overflow: `${start.height}/${start.client}`, scrolledTo: bottom.top, fit: start.fit, pageScrollChecked: pageScrollable };
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const results = [];
  let failed = false;
  try {
    for (const viewport of VIEWPORTS) {
      try { results.push({ ok: true, ...(await run(browser, server.url, viewport)) }); }
      catch (error) { failed = true; results.push({ ok: false, viewport: viewport.join('x'), error: error.message }); }
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(path.join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
  process.exit(failed ? 1 : 0);
})();
