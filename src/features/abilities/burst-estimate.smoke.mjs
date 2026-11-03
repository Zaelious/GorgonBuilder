/* global process, console, localStorage, sessionStorage, document, innerWidth, fetch, setTimeout */
// Synthetic official-ID fixture. Run after npm run build; Playwright is a machine tool, not an app dependency.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const output = resolve(process.argv[2] ?? '/tmp/t0013-burst-browser');
mkdirSync(output, { recursive: true });
const draft = {
  schemaVersion: 1, gameDataVersion: 'v490', title: 'T0013-F1 Burst verification', notes: '',
  skillSlotA: { skillId: 'Psychology', level: 100 }, skillSlotB: { skillId: 'Deer', level: 100 },
  abilityBarA: [{ abilityId: 'ability_6553', rank: null }], abilityBarB: [],
  equipment: [
    { slot: 'OffHand', item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } }, candidateMods: [{ powerId: 'power_4066', tierId: 'id_20' }], sparks: { mode: 'none' } },
    { slot: 'Hands', item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } }, candidateMods: [{ powerId: 'power_4032', tierId: 'id_18' }], sparks: { mode: 'none' } },
  ], target: { count: 1, damageTypes: {} },
};
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '5193', '--strictPort'], { stdio: 'ignore', detached: true });
const url = 'http://127.0.0.1:5193/';
const assert = (value, message) => { if (!value) throw Error(message); };
let browser;
try {
  for (let n = 0; n < 100; n++) { try { if ((await fetch(url)).ok) break; } catch { /* server starting */ } await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'], ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } } : {}) });
  const results = [];
  for (const [width, height] of [[1440, 900], [375, 812], [320, 812]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(value => { if (!sessionStorage.getItem('burst-seeded')) { localStorage.setItem('gorgonbuilder.current-draft', JSON.stringify(value)); sessionStorage.setItem('burst-seeded', '1'); } }, draft);
    await page.goto(url);
    const toggle = page.locator('.damage-analysis-toggle input');
    await toggle.waitFor();
    assert(!(await toggle.isChecked()), `${width}: analysis defaults off`);
    const slot = page.locator('.skill-panel:nth-child(1) .combat-slot:nth-child(1) .slot-button');
    await slot.click();
    assert(await page.locator('.ability-results').count() === 0, 'analysis off hides results');
    assert(await page.locator('.relevant-mods').count() > 0, 'Relevant Mods retained');
    await page.keyboard.press('Escape');
    await toggle.check();
    for (const [count, retained] of [[1, 1], [5, 1], [6, .8125], [7, .625], [8, .4375], [9, .25]]) {
      await page.locator('#target-count').fill(String(count));
      await slot.click();
      const card = page.locator('.ability-popover');
      const hit = card.locator('.result-row[data-component="health-specific"] dd').first();
      const value = await hit.textContent();
      const format = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
      const expected = format(178 * 1.43 * .5 * retained);
      assert(value.includes(expected), `${width}/${count}: ${value}, expected ${expected}`);
      if (count > 1) {
        const total = await card.locator('.result-total dd').textContent();
        assert(total.includes(format(178 * 1.43 * .5 * retained * count)), `${width}/${count}: total ${total}`);
      }
      const estimated = count >= 6 && count <= 8;
      assert((await card.locator('.result-estimate').count()) === (estimated ? 2 : 0), `${width}/${count}: Estimated label`);
      const box = await card.boundingBox();
      assert(box.width <= 480 && box.x >= 0 && box.x + box.width <= width + 1, 'compact viewport-bounded popover');
      if (count === 6) {
        await page.screenshot({ path: resolve(output, `${width}-estimated.png`) });
        await card.locator('.calc-breakdown > summary').click();
        assert((await card.locator('[data-falloff="direct"]').textContent()).includes('81.25%'), 'equation visible in breakdown');
        assert((await card.locator('.calc-step[data-category="ability-multiplier"]').textContent()).includes('0.5'), 'independent ability penalty');
        await card.locator('.remove-ability').scrollIntoViewIfNeeded();
        assert(await card.locator('.remove-ability').isVisible(), 'Remove reachable');
      }
      results.push({ width, height, count, retained, displayed: value, estimated });
      await page.keyboard.press('Escape');
    }
    await page.reload();
    assert(await toggle.isChecked(), 'analysis session preference survives reload');
    const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    // Main and feature both have a measured 2px planner-help overflow at 320px; the changed card is bounded above.
    assert(geometry.scroll <= width + (width === 320 ? 2 : 0), `${width}: horizontal overflow ${JSON.stringify(geometry)}`);
    assert(errors.length === 0, errors.join('; '));
    await page.close();
  }
  writeFileSync(resolve(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(`Passed ${results.length} Burst scenarios across 1440/375/320 px, default/session state and disclosure checks.`);
} finally { await browser?.close(); process.kill(-server.pid); }
