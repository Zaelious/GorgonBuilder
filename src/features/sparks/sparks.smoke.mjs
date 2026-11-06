/* global process, console, localStorage, sessionStorage, document, innerWidth, fetch, setTimeout */
// T0015 real-browser smoke. Synthetic official-ID draft only; no CharacterSheet/Storage export is used.
// Usage: node src/features/sparks/sparks.smoke.mjs --mode dev|preview --output <dir>   (preview needs npm run build first)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };
const mode = arg('mode', 'preview');
const output = resolve(arg('output', '/tmp/t0015-sparks')); // committed evidence: docs/verification/t0015
mkdirSync(output, { recursive: true });
const db = (slot, itemId) => ({ slot, item: { kind: 'database', itemId }, candidateMods: [], sparks: { mode: 'none' } });
// Offensive items without damage effects, so Spark deltas are isolated.
const draft = {
  schemaVersion: 1, gameDataVersion: 'v490', title: 'T0015 Spark verification', notes: '',
  skillSlotA: { skillId: 'Psychology', level: 100 }, skillSlotB: { skillId: 'Archery', level: 100 },
  abilityBarA: [{ abilityId: 'ability_6553', rank: null }], abilityBarB: [{ abilityId: 'ability_2535', rank: null }],
  equipment: [db('MainHand', 'item_47068'), db('OffHand', 'item_52601'), db('Ring', 'item_49083'), db('Necklace', 'item_48150')],
  target: { count: 1, damageTypes: {} },
};
const MANUAL = { allDirectDamagePercent: 11, skillDamageFlat: 44, allDirectDamageFlat: 11, skillDamagePercent: 26, skillBaseDamagePercent: 18 };
const port = mode === 'dev' ? 5196 : 5197;
const server = spawn('npm', ['run', mode === 'dev' ? 'dev' : 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
const url = `http://127.0.0.1:${port}/`;
const assert = (value, message) => { if (!value) throw Error(message); };
let browser;
try {
  for (let n = 0; n < 200; n++) { try { if ((await fetch(url)).ok) break; } catch { /* server starting */ } await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const results = [];
  for (const [width, height] of [[1440, 900], [375, 812], [320, 812]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(value => {
      if (!sessionStorage.getItem('sparks-seeded')) {
        localStorage.setItem('gorgonbuilder.current-draft', JSON.stringify(value));
        sessionStorage.setItem('gorgonbuilder.session.damage-analysis', '1');
        sessionStorage.setItem('sparks-seeded', '1');
      }
    }, draft);
    await page.goto(url);
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('gorgonbuilder.current-draft')));
    const settle = () => page.waitForTimeout(650); // 500 ms autosave debounce
    const row = slot => page.locator(`[data-equipment-row="${slot}"]`);
    const openSparks = async slot => {
      if (!(await row(slot).evaluate(e => e.open))) await row(slot).locator('> summary').click();
      const editor = row(slot).locator('.spark-editor');
      if (!(await editor.evaluate(e => e.open))) await editor.locator('> summary').click();
      return editor;
    };
    const hit = async (bar, component) => {
      await page.locator(`.skill-panel:nth-child(${bar}) .combat-slot:nth-child(1) .slot-button`).click();
      const text = (await page.locator(`.ability-popover .result-row[data-component="${component}"] dd`).textContent()).trim();
      await page.keyboard.press('Escape');
      return text;
    };
    const mock = () => hit(1, 'health-specific');
    const aimed = () => hit(2, 'damage');
    const scenarios = [];
    const before = { mock: await mock(), aimed: await aimed() };
    assert(before.mock.startsWith('178 Psychic') && before.aimed.startsWith('231 '), `baseline ${JSON.stringify(before)}`);

    // 1–2. Every offensive row offers the collapsed editor; Ring: keyboard-select Simulate (110 by default).
    for (const slot of ['MainHand', 'OffHand', 'Ring', 'Necklace']) {
      await row(slot).locator('> summary').click();
      assert(await row(slot).locator('.spark-editor').count() === 1, `${slot} editor`);
      assert(!(await row(slot).locator('.spark-editor').evaluate(e => e.open)), `${slot} collapsed by default`);
      await row(slot).locator('> summary').click();
    }
    let ring = await openSparks('Ring');
    await ring.locator('.spark-mode input[value="none"]').focus();
    await page.keyboard.press('ArrowRight'); // native radio group: moves to and selects Simulate
    await settle();
    let sparks = (await saved()).equipment[2].sparks;
    assert(sparks.mode === 'simulated' && sparks.input.count === 110 && sparks.input.skillId === 'Psychology', `simulated ${JSON.stringify(sparks)}`);
    const counts = sparks.result.outcomeCounts;
    assert(Object.values(counts).reduce((a, b) => a + b, 0) === 110, 'outcomes total 110');
    assert((await ring.locator('[data-spark-total]').textContent()).trim() === '110 / 110', 'total row');
    assert((await ring.locator('tr[data-outcome="skillBaseDamagePercent"] td').last().textContent()).trim() === `+${counts.skillBaseDamagePercent * 3}%`, 'bonus = outcomes × 3%');
    const firstSeed = sparks.input.seed;
    await page.screenshot({ path: resolve(output, `${mode}-${width}-simulated.png`), fullPage: false });
    const simulatedMock = await mock();
    assert(simulatedMock !== before.mock, 'Mock changes with Sparks');
    scenarios.push({ step: 'simulate-110', seed: firstSeed, counts, mock: simulatedMock });

    // 6. Reroll: new seed and recalculated outcomes; other equipment untouched.
    ring = await openSparks('Ring');
    const others = JSON.stringify((await saved()).equipment.filter((_, i) => i !== 2));
    await ring.locator('.spark-reroll').click(); await settle();
    sparks = (await saved()).equipment[2].sparks;
    assert(sparks.input.seed !== firstSeed, 'reroll changes seed');
    assert((await ring.locator('.spark-seed').textContent()).includes(sparks.input.seed), 'seed displayed');
    assert(JSON.stringify((await saved()).equipment.filter((_, i) => i !== 2)) === others, 'other gear unchanged');
    scenarios.push({ step: 'reroll', seed: sparks.input.seed, counts: sparks.result.outcomeCounts, mock: await mock() });

    // 7. Refresh: identical saved configuration and display.
    const bytes = await page.evaluate(() => localStorage.getItem('gorgonbuilder.current-draft'));
    const shownBefore = await ring.locator('tbody').textContent();
    await page.reload(); ring = await openSparks('Ring');
    assert(await page.evaluate(() => localStorage.getItem('gorgonbuilder.current-draft')) === bytes, 'refresh keeps saved Sparks');
    assert(await ring.locator('tbody').textContent() === shownBefore, 'refresh shows identical outcomes');

    // 8. Actual results 11/44/11/26/18 → exact Mock and Aimed Shot values.
    await ring.locator('.spark-mode input[value="actual"]').check(); await settle();
    for (const [key, value] of Object.entries(MANUAL)) await ring.locator(`tr[data-outcome="${key}"] input`).fill(String(value));
    await settle();
    assert(JSON.stringify((await saved()).equipment[2].sparks.outcomeCounts) === JSON.stringify(MANUAL), 'manual counts saved');
    const actual = { mock: await mock(), aimed: await aimed() };
    // Mock: 178 + 44 + 11 = 233; 233 × 0.315 = 73.395; 178 × 0.54 = 96.12 → 402.515. Aimed Shot: (231 + 11) × 1.055 = 255.31.
    assert(actual.mock.startsWith('402.52 Psychic') && actual.aimed.startsWith('255.31 '), `actual ${JSON.stringify(actual)}`);
    await ring.locator('tr[data-outcome="skillDamageFlat"] input').fill('45');
    assert((await ring.locator('.spark-error').textContent()).includes('Total 111 is over 110'), 'over-total error');
    await ring.locator('tr[data-outcome="skillDamageFlat"] input').fill('44'); await settle();
    await page.screenshot({ path: resolve(output, `${mode}-${width}-actual.png`) });
    scenarios.push({ step: 'actual-110', ...actual });

    // 9. A second item combines: Necklace +5 All Direct flat → (238 × 1.315) + 96.12 = 409.09.
    const necklace = await openSparks('Necklace');
    await necklace.locator('.spark-mode input[value="actual"]').check(); await settle();
    await necklace.locator('tr[data-outcome="allDirectDamageFlat"] input').fill('5'); await settle();
    const combined = await mock();
    assert(combined.startsWith('409.09 Psychic'), `combined ${combined}`);
    await page.locator('.skill-panel:nth-child(1) .combat-slot:nth-child(1) .slot-button').click();
    const card = page.locator('.ability-popover');
    await card.locator('.damage-breakdown > summary').click();
    const breakdown = await card.locator('.damage-breakdown').textContent();
    assert(breakdown.includes('Ring Sparks') && breakdown.includes('Necklace Sparks') && breakdown.includes('of original base 178'), 'source-attributed breakdown');
    assert(!/MOD_|BOOST_|power_|skill-damage-sparks/u.test(breakdown), 'public breakdown has no diagnostics');
    await card.screenshot({ path: resolve(output, `${mode}-${width}-breakdown.png`) });
    const box = await card.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= width + 1, `${width}: popover within viewport`);
    await page.keyboard.press('Escape');
    scenarios.push({ step: 'ring+necklace', mock: combined });

    // 10. Clearing the Necklace removes only its contribution (confirmation required).
    page.once('dialog', dialog => dialog.accept());
    await row('Necklace').locator('.equipment-actions button', { hasText: 'Clear' }).click(); await settle();
    const cleared = await mock();
    assert(cleared.startsWith('402.52 Psychic'), `after clear ${cleared}`);
    // 11. Switching the Ring's Sparks to Archery moves skill bonuses to Aimed Shot only.
    ring = await openSparks('Ring');
    await ring.locator('.spark-field select').selectOption('Archery'); await settle();
    const switched = { mock: await mock(), aimed: await aimed() };
    // Mock keeps only All Direct: (178 + 11) × 1.055 = 199.395 → 199.4. Aimed: 231+44+11=286; ×1.315 = 376.09; + 231 × 0.54 = 124.74 → 500.83.
    assert(switched.mock.startsWith('199.4 Psychic') && switched.aimed.startsWith('500.83 '), `switched ${JSON.stringify(switched)}`);
    scenarios.push({ step: 'necklace-cleared', mock: cleared }, { step: 'ring-archery', ...switched });
    // Reset to none restores the baseline.
    await ring.locator('.spark-mode input[value="none"]').check(); await settle();
    const reset = { mock: await mock(), aimed: await aimed() };
    assert(JSON.stringify(reset) === JSON.stringify(before), `reset ${JSON.stringify(reset)}`);

    const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    // Pre-existing 2 px planner-help overflow at 320 px (documented on main since T0013-F1).
    assert(geometry.scroll <= width + (width === 320 ? 2 : 0), `${width}: horizontal overflow ${JSON.stringify(geometry)}`);
    assert(errors.length === 0, `console/page errors: ${errors.join('; ')}`);
    results.push({ mode, width, height, before, scenarios, geometry });
    await page.close();
  }
  writeFileSync(resolve(output, `${mode}-results.json`), JSON.stringify(results, null, 2) + '\n');
  console.log(`Passed ${mode} Spark smoke at 1440/375/320 px (${results.reduce((n, r) => n + r.scenarios.length, 0)} scenarios).`);
} finally { await browser?.close(); try { process.kill(-server.pid); } catch { /* already stopped */ } }
