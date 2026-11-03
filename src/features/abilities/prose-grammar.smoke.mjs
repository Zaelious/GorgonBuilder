/* global process, console, localStorage, document, innerWidth, fetch, setTimeout */
// T0013-F1 grammar browser smoke with exact official IDs. Run after npm run build; Playwright is a machine tool, not an app dependency.
// Heavy Shot 1 (ability_2601, base 29 Piercing) with a reusable-grammar mod (power_10201 id_9, +10%) and the curated
// exact-sentence mod (power_10202 id_9, +9%, reuse remainder). The displayed hit must rise by exactly 29 × 0.19.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const output = resolve(process.argv[2] ?? '/tmp/t0013-grammar-browser');
mkdirSync(output, { recursive: true });
const manual = candidateMods => ({ item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } }, candidateMods, sparks: { mode: 'none' } });
const draft = mods => ({
  schemaVersion: 1, gameDataVersion: 'v490', title: 'T0013-F1 grammar verification', notes: '',
  skillSlotA: { skillId: 'Archery', level: 1 }, skillSlotB: { skillId: null, level: 0 },
  abilityBarA: [{ abilityId: 'ability_2601', rank: null }], abilityBarB: [],
  equipment: mods ? [{ slot: 'Chest', ...manual([{ powerId: 'power_10201', tierId: 'id_9' }]) }, { slot: 'Ring', ...manual([{ powerId: 'power_10202', tierId: 'id_9' }]) }] : [],
  target: { count: 1, damageTypes: {} },
});
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '5194', '--strictPort'], { stdio: 'ignore', detached: true });
const url = 'http://127.0.0.1:5194/';
const assert = (value, message) => { if (!value) throw Error(message); };
const number = text => Number(/([\d,]+(?:\.\d+)?)/u.exec(text)[1].replace(/,/gu, ''));
let browser;
try {
  for (let n = 0; n < 100; n++) { try { if ((await fetch(url)).ok) break; } catch { /* server starting */ } await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const results = [];
  for (const [width, height] of [[1440, 900], [375, 812]]) {
    const values = {};
    for (const mods of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(value => {
        localStorage.setItem('gorgonbuilder.current-draft', JSON.stringify(value));
      }, draft(mods));
      await page.goto(url);
      const toggle = page.locator('.damage-analysis-toggle input');
      await toggle.waitFor();
      if (!(await toggle.isChecked())) await toggle.check();
      await page.locator('.skill-panel:nth-child(1) .combat-slot:nth-child(1) .slot-button').click();
      const card = page.locator('.ability-popover');
      const text = await card.locator('.result-row[data-component="damage"] dd').first().textContent();
      values[mods ? 'with' : 'without'] = number(text);
      if (mods) {
        await card.locator('.calc-breakdown > summary').click();
        const breakdown = await card.locator('.calc-breakdown').textContent();
        assert(breakdown.includes('Heavy Shot Damage %'), `${width}: grammar modifier visible in breakdown`);
        assert(/reuse/iu.test(breakdown), `${width}: curated reuse remainder retained as an unmodeled build effect`);
        await page.screenshot({ path: resolve(output, `${width}-grammar.png`) });
      }
      const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert(geometry.scroll <= width, `${width}: horizontal overflow ${JSON.stringify(geometry)}`);
      assert(errors.length === 0, errors.join('; '));
      await page.close();
    }
    const delta = values.with - values.without;
    assert(Math.abs(delta - 29 * 0.19) < 0.01, `${width}: delta ${delta}, expected ${29 * 0.19}`);
    results.push({ width, height, without: values.without, with: values.with, delta });
  }
  writeFileSync(resolve(output, 'grammar-results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(`Passed grammar UI scenarios: ${JSON.stringify(results)}`);
} finally { await browser?.close(); process.kill(-server.pid); }
