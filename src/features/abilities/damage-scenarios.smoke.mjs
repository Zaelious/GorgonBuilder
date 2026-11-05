/* global process, console, localStorage, sessionStorage, document, innerWidth, fetch, setTimeout */
// Synthetic manual builds; real Chromium checks against Vite development and built production preview.
// NODE_PATH=<Playwright installation> CHROMIUM_PATH=<binary> node ... --mode dev|preview --output <dir>
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; };
const mode = arg('mode', 'preview'), output = resolve(arg('output', '/tmp/t0014-f1-scenarios'));
// Optional deterministic icon responses for environments whose browser lacks the session proxy CA.
// This exercises application behavior/layout without modifying TLS settings; it does not verify CDN transport.
const localIcons = arg('local-icons', '0') === '1';
const iconResponses = async target => {
  if (localIcons) await target.route('https://cdn.projectgorgon.com/v490/icons/icon_*.png', route => route.fulfill({
    status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#262626"/><text x="32" y="42" text-anchor="middle" font-size="32" fill="#b3b3b3">?</text></svg>',
  }));
};
mkdirSync(output, { recursive: true });
const manual = { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } };
const equipment = (slot, ...mods) => ({ slot, item: manual, candidateMods: mods.map(([powerId, tierId]) => ({ powerId, tierId })), sparks: { mode: 'none' } });
const draft = {
  schemaVersion: 1, gameDataVersion: 'v490', title: 'T0014-F1 scenario verification', notes: '',
  skillSlotA: { skillId: 'Cow', level: 0 }, skillSlotB: { skillId: 'Psychology', level: 0 },
  abilityBarA: [{ abilityId: 'ability_6138', rank: null }, { abilityId: 'ability_6124', rank: null }],
  abilityBarB: [{ abilityId: 'ability_1298', rank: null }, { abilityId: 'ability_6553', rank: null }],
  equipment: [equipment('Chest', ['power_20004', 'id_20'], ['power_4062', 'id_25']), equipment('Hands')],
  target: { count: 1, damageTypes: {} },
};
const port = mode === 'dev' ? 5196 : 5197, url = `http://127.0.0.1:${port}/`;
const server = spawn('npm', ['run', mode === 'dev' ? 'dev' : 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
const assert = (condition, message) => { if (!condition) throw Error(message); };
let browser;
try {
  let ready = false;
  for (let n = 0; n < 200; n++) { try { if ((await fetch(url)).ok) { ready = true; break; } } catch { /* startup */ } await new Promise(r => setTimeout(r, 100)); }
  assert(ready, 'Vite started');
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
  const results = [];
  for (const [width, height] of [[1440, 900], [375, 812], [320, 812]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    await iconResponses(context);
    const page = await context.newPage(), errors = [], cases = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('dialog', dialog => dialog.accept());
    await page.addInitScript(value => {
      if (!sessionStorage.getItem('scenario-seeded')) {
        localStorage.setItem('gorgonbuilder.current-draft', JSON.stringify(value));
        sessionStorage.setItem('gorgonbuilder.session.damage-analysis', '1');
        sessionStorage.setItem('gorgonbuilder.session.critical-scenario', JSON.stringify({ version: 1, creatureType: 'Anatomy_Humans', elite: 'unknown', manualLevels: { Phrenology_Humans: 48 } }));
        sessionStorage.setItem('scenario-seeded', '1');
      }
    }, draft);
    await page.goto(`${url}?debugDamage=1`);
    await page.locator('#target-creature').waitFor();
    const open = async (bar = 1, slot = 1) => {
      await page.locator(`.skill-panel:nth-child(${bar}) .combat-slot:nth-child(${slot}) .slot-button`).click();
      const card = page.locator('.ability-popover'); await card.locator('.ability-results').waitFor(); return card;
    };
    const close = () => page.keyboard.press('Escape');
    const row = async (card, selector) => (await card.locator(`${selector} dd`).first().textContent()).trim();
    let card = await open();
    const originalDraft = await page.evaluate(() => localStorage.getItem('gorgonbuilder.current-draft'));
    assert(await row(card, '[data-component="damage"]') === '208 Crushing', 'ordinary Stampede stays 208');
    assert((await card.locator('.relevant-mods').textContent()).includes('Damage scenario'), 'relevant mod identifies its scenario calculation');
    for (const [stacks, expected] of [['0', '208'], ['1', '258'], ['15', '958']]) {
      const control = card.locator('.stampede-control select'); await control.focus(); await control.selectOption(stacks);
      assert((await row(card, '[data-stampede="projected"]')).startsWith(`${expected} `), `${stacks} stacks => ${expected}`);
      cases.push({ stacks: Number(stacks), projected: expected });
    }
    assert(await page.evaluate(() => localStorage.getItem('gorgonbuilder.current-draft')) === originalDraft, 'stack scenario leaves saved build unchanged');
    assert(!(await card.locator('.damage-breakdown').evaluate(e => e.open)), 'breakdown collapsed by default');
    await card.locator('.damage-breakdown > summary').click();
    assert((await card.locator('.damage-breakdown').textContent()).includes('+50 per stack × 15'), 'source contribution visible');
    assert(await card.locator('[data-scenario-debug]').count() === (mode === 'dev' ? 1 : 0), 'debug diagnostics gated by build mode');
    const publicText = await card.locator('.damage-breakdown').textContent();
    assert(!/power_|BOOST_|Assumed:|sourcePath/u.test(publicText), 'public breakdown contains numerical results only');
    await page.screenshot({ path: resolve(output, `${mode}-${width}-stampede-one.png`) });
    await close();

    // Existing Available -> Selected workflow; add a second differently tiered mod through the real equipment editor.
    const hands = page.locator('[data-equipment-row="Hands"]'); await hands.locator('> summary').click();
    await hands.locator('.mod-available-power[data-power-id="power_20004"] > .available-effect').click();
    const selectedHands = hands.locator('[data-selected-power-id="power_20004"]'); await selectedHands.waitFor();
    assert(await selectedHands.getAttribute('data-selected-tier-id') === 'id_25', 'actual Max preview selects tier 25');
    card = await open(); assert((await row(card, '[data-stampede="projected"]')).startsWith('1,933 '), 'two sources +1725');
    await card.locator('.damage-breakdown > summary').click();
    assert((await card.locator('.damage-breakdown').textContent()).includes('+65 per stack × 15'), 'second named contribution');
    await page.screenshot({ path: resolve(output, `${mode}-${width}-stampede-two.png`) }); await close();

    // Change an exact selected tier through the existing tier control.
    const chest = page.locator('[data-equipment-row="Chest"]'); await chest.locator('> summary').click();
    const chestStack = chest.locator('[data-selected-power-id="power_20004"]'); await chestStack.locator('details.candidate-details > summary').click();
    await chestStack.locator('select').selectOption('id_1');
    card = await open(); assert((await row(card, '[data-stampede="projected"]')).startsWith('1,243 '), 'tier replacement recalculates'); await close();
    await selectedHands.locator('.candidate-remove').click();
    card = await open(); assert((await row(card, '[data-stampede="projected"]')).startsWith('268 '), 'removing source reverses contribution'); await close();
    card = await open(1, 2); assert(await card.locator('.stampede-control').count() === 0, 'other Cow ability has no stack control'); await close();

    // Strike a Nerve: unconditional +100 and independent random-damage / critical displays.
    card = await open(2);
    const criticalBefore = await card.locator('[data-critical="chance"] dd').textContent();
    assert(await row(card, '[data-component="damage"]') === '530 Psychic', '+100 exactly once');
    assert((await row(card, '[data-proc="chance"]')).startsWith('33% '), '33% random proc');
    assert(await row(card, '[data-proc="hit"]') === '1,060', 'double final ordinary hit');
    assert(await row(card, '[data-proc="expected"]') === '704.9', 'weighted noncritical expectation');
    await card.locator('.damage-breakdown > summary').click();
    await page.screenshot({ path: resolve(output, `${mode}-${width}-proc.png`) });
    await card.locator('.remove-ability').scrollIntoViewIfNeeded();
    assert(await card.locator('.remove-ability').isVisible(), 'popover bottom remains reachable');
    const bounds = await card.boundingBox(); assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, 'popover fits viewport');
    await close();

    // Add a duplicate in the other permitted slot: no sum or independent-roll assumption.
    await hands.locator('.mod-available-power[data-power-id="power_4062"] > .available-effect').click();
    card = await open(2);
    assert(await row(card, '[data-proc="expected"]') === 'Unavailable', 'duplicate expectation unavailable');
    assert(await card.locator('[data-critical="chance"] dd').textContent() === criticalBefore, 'critical probability unchanged');
    await close(); await hands.locator('[data-selected-power-id="power_4062"] .candidate-remove').click();
    await chest.locator('[data-selected-power-id="power_4062"] .candidate-remove').click();
    card = await open(2); assert(await card.locator('[data-proc]').count() === 0, 'proc removal hides results');
    assert(await row(card, '[data-component="damage"]') === '430 Psychic', 'proc removal restores normal');
    assert(await card.locator('[data-critical="chance"] dd').textContent() === criticalBefore, 'critical probability still unchanged');
    await close();

    await page.reload(); await page.locator('#target-creature').waitFor(); card = await open();
    assert(await card.locator('.stampede-control select').inputValue() === '15', 'current stacks survive reload'); await close();
    await chest.locator('> summary').click(); await chest.locator('[data-selected-power-id="power_20004"] .candidate-remove').click();
    card = await open(); assert(await card.locator('.stampede-control').count() === 0, 'last removal hides control');
    assert(await row(card, '[data-component="damage"]') === '208 Crushing', 'last removal restores baseline'); await close();
    const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert(geometry.scroll <= width + (width === 320 ? 2 : 0), 'no added document overflow');
    assert(errors.length === 0, `browser errors: ${errors.join('; ')}`);
    results.push({ mode, width, height, iconTransport: localIcons ? 'local-placeholder' : 'official-cdn', cases, twoSources: 1933, tierReplacement: 1243, removal: 268, proc: { normal: 530, triggered: 1060, probability: 0.33, expected: 704.9 }, geometry, errors });
    await context.close();

    // A second audited chance power, using another clean manual build and the real UI.
    const deer = await browser.newPage({ viewport: { width, height } });
    await iconResponses(deer);
    deer.on('pageerror', error => errors.push(error.message));
    deer.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await deer.addInitScript(value => {
      localStorage.setItem('gorgonbuilder.current-draft', JSON.stringify(value)); sessionStorage.setItem('gorgonbuilder.session.damage-analysis', '1');
    }, { ...draft, skillSlotA: { skillId: 'Deer', level: 0 }, skillSlotB: { skillId: null, level: 0 },
      abilityBarA: [{ abilityId: 'ability_1557', rank: null }], abilityBarB: [], equipment: [equipment('Hands', ['power_21023', 'id_13'])] });
    await deer.goto(url); await deer.locator('#target-creature').waitFor();
    await deer.locator('.skill-panel:nth-child(1) .combat-slot:nth-child(1) .slot-button').click();
    const deerCard = deer.locator('.ability-popover');
    assert((await row(deerCard, '[data-proc="chance"]')).startsWith('24% '), 'Deer Bash selected probability');
    assert(await row(deerCard, '[data-proc="hit"]') === '167.04', 'Deer Bash selected proc bonus');
    assert(await row(deerCard, '[data-proc="expected"]') === '106.21', 'Deer Bash expectation');
    assert(errors.length === 0, `browser errors: ${errors.join('; ')}`);
    await deer.close();
  }
  writeFileSync(resolve(output, `${mode}-results.json`), JSON.stringify(results, null, 2) + '\n');
  console.log(`Passed ${mode} stack/proc and mod-editor Chromium smoke at 1440/375/320 px.`);
} finally { await browser?.close(); try { process.kill(-server.pid); } catch { /* already stopped */ } }
