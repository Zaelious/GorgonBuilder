/* global process, console, localStorage, sessionStorage, document, innerWidth, fetch, setTimeout */
// T0013-F2 real-browser smoke. Synthetic official-ID draft only; no CharacterSheet export is used.
// Usage: node src/features/abilities/critical.smoke.mjs --mode dev|preview --output <dir>   (preview needs npm run build first)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };
const mode = arg('mode', 'preview');
const output = resolve(arg('output', '/tmp/t0013-f2-critical'));
mkdirSync(output, { recursive: true });
const manual = { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } };
const draft = {
  schemaVersion: 1, gameDataVersion: 'v490', title: 'T0013-F2 critical verification', notes: '',
  skillSlotA: { skillId: 'Psychology', level: 100 }, skillSlotB: { skillId: 'Mentalism', level: 100 },
  abilityBarA: [{ abilityId: 'ability_6553', rank: null }], abilityBarB: [],
  equipment: [
    // {MOD_CRITICAL_HIT_DAMAGE}{2.4}{Psychology} and {MOD_CRITICAL_HIT_DAMAGE}{2}{Mentalism}
    { slot: 'Chest', item: manual, candidateMods: [{ powerId: 'power_4009', tierId: 'id_20' }], sparks: { mode: 'none' } },
    { slot: 'Head', item: manual, candidateMods: [{ powerId: 'power_9009', tierId: 'id_20' }], sparks: { mode: 'none' } },
  ], target: { count: 1, damageTypes: {} },
};
const port = mode === 'dev' ? 5194 : 5195;
const server = spawn('npm', ['run', mode === 'dev' ? 'dev' : 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
const url = `http://127.0.0.1:${port}/`;
const assert = (value, message) => { if (!value) throw Error(message); };
const format = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
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
      if (!sessionStorage.getItem('critical-seeded')) {
        localStorage.setItem('gorgonbuilder.current-draft', JSON.stringify(value));
        sessionStorage.setItem('gorgonbuilder.session.damage-analysis', '1');
        sessionStorage.setItem('critical-seeded', '1');
      }
    }, draft);
    await page.goto(`${url}?debugDamage=1`);
    const creature = page.locator('#target-creature');
    await creature.waitFor();
    assert(await page.locator('.target-critical').evaluate(e => !e.open), 'critical skills collapsed by default');
    // Keyboard: focus the selector and choose a type with the keyboard, then open the disclosure with Enter.
    await creature.focus();
    await creature.selectOption('Anatomy_Humans');
    await page.locator('.target-critical > summary').focus();
    await page.keyboard.press('Enter');
    assert(await page.locator('.target-critical').evaluate(e => e.open), 'Enter opens critical skills');
    await page.locator('#critical-level-Phrenology_Humans').focus();
    await page.keyboard.type('30');
    assert(await page.locator('[data-critical-skill="Phrenology_Humans"]').getAttribute('data-origin') === 'manual', 'manual origin');
    await page.screenshot({ path: resolve(output, `${mode}-${width}-target.png`) });

    const slot = page.locator('.skill-panel:nth-child(1) .combat-slot:nth-child(1) .slot-button');
    const open = async () => { await slot.click(); await page.locator('.ability-popover .ability-results').waitFor(); return page.locator('.ability-popover'); };
    const row = async (card, kind) => (await card.locator(`[data-critical="${kind}"] dd`).first().textContent()).trim();
    const multiplier = 1.25 + 2.4 + 2;
    const scenarios = [];
    let card = await open();
    assert((await card.locator('.result-row[data-component="health-specific"] dd').textContent()).includes('178 Psychic'), 'normal hit unchanged');
    const human = { chance: await row(card, 'chance'), critical: await row(card, 'hit'), expected: await row(card, 'expected') };
    assert(human.chance.startsWith('5%') && human.chance.includes('Human Phrenology 30 (manual)'), `chance ${human.chance}`);
    assert(human.critical.includes(format(178 * multiplier)), `critical ${human.critical}`);
    assert(human.expected === format(178 * 0.95 + 178 * multiplier * 0.05), `expected ${human.expected}`);
    scenarios.push({ creature: 'Human', ...human });
    const breakdown = card.locator('.damage-breakdown');
    assert(!(await breakdown.evaluate(e => e.open)), 'Damage breakdown collapsed by default');
    await breakdown.locator('> summary').click();
    assert((await card.locator('.calc-critical').textContent()).includes('Critical multiplier× 5.65'), 'critical multiplier step');
    const debugVisible = await card.locator('[data-critical-debug]').count();
    assert(mode === 'dev' ? debugVisible === 1 : debugVisible === 0, `${mode}: debug diagnostics gate (${debugVisible})`);
    const publicText = await card.locator('.damage-breakdown').textContent();
    assert(!/PhrenologyCriticals|MOD_CRITICAL|power_|CritDamageMod/u.test(publicText), 'public breakdown has no diagnostics');
    await card.locator('.remove-ability').scrollIntoViewIfNeeded();
    assert(await card.locator('.remove-ability').isVisible(), 'Remove reachable');
    await page.screenshot({ path: resolve(output, `${mode}-${width}-results.png`) });
    const box = await card.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= width + 1, `${width}: popover within viewport`);
    await page.keyboard.press('Escape');

    for (const [type, check] of [
      ['Anatomy_Canines', (c) => c.chance.startsWith('0%') && c.expected === '178'],
      ['Anatomy_Orcs', (c) => c.chance.startsWith('Unavailable') && c.expected === 'Unavailable' && c.critical.includes(format(178 * multiplier))],
      ['', (c) => c.chance.includes('select a creature type') && c.expected === 'Unavailable'],
    ]) {
      await creature.selectOption(type);
      card = await open();
      const values = { chance: await row(card, 'chance'), critical: await row(card, 'hit'), expected: await row(card, 'expected') };
      assert(check(values), `${width}/${type || 'Unknown'}: ${JSON.stringify(values)}`);
      assert((await card.locator('.result-row[data-component="health-specific"] dd').textContent()).includes('178 Psychic'), 'normal hit unchanged');
      scenarios.push({ creature: type || 'Unknown', ...values });
      await page.keyboard.press('Escape');
    }
    // Session scenario survives reload; the saved build is untouched.
    await page.reload();
    await creature.waitFor();
    assert(await creature.inputValue() === '', 'Unknown remembered');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('gorgonbuilder.current-draft')));
    assert(JSON.stringify(stored.target) === JSON.stringify(draft.target) && !('critical' in stored), 'BuildDocument unchanged');
    const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    // Pre-existing 2 px planner-help overflow at 320 px (documented on main since T0013-F1).
    assert(geometry.scroll <= width + (width === 320 ? 2 : 0), `${width}: horizontal overflow ${JSON.stringify(geometry)}`);
    assert(errors.length === 0, `console/page errors: ${errors.join('; ')}`);
    results.push({ mode, width, height, scenarios, geometry, debugDiagnostics: debugVisible === 1 });
    await page.close();
  }
  writeFileSync(resolve(output, `${mode}-results.json`), JSON.stringify(results, null, 2) + '\n');
  console.log(`Passed ${mode} critical smoke at 1440/375/320 px (${results.reduce((n, r) => n + r.scenarios.length, 0)} scenarios).`);
} finally { await browser?.close(); try { process.kill(-server.pid); } catch { /* already stopped */ } }
