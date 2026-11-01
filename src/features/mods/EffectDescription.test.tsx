import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { EffectDescription, EffectDescriptions, EffectRequirements, ExactEffects } from './EffectDescription';
import { presentEffect, shiftDecimal, signed } from './effect-description';
let data: ReturnType<typeof loadPlannerFixture>;
let container: HTMLDivElement, root: Root;
beforeAll(() => { data = loadPlannerFixture(); });
beforeEach(() => { container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function render(description: string, version = data.gameDataVersion) {
  await act(async () => root.render(<EffectDescription description={description} data={{ ...data, gameDataVersion: version }} fallback="My power" />));
}
it('renders text before/after and multiple actual official icons, preserving their order', async () => {
  await render('Before <icon=2160> pet <icon=108> after');
  expect(container.textContent).toBe('Before  pet  after');
  const images = [...container.querySelectorAll('img')];
  expect(images.map(img => img.src)).toEqual(['https://cdn.projectgorgon.com/v490/icons/icon_2160.png', 'https://cdn.projectgorgon.com/v490/icons/icon_108.png']);
  expect(images.map(img => img.alt)).toEqual(['Official effect icon 2160', 'Official effect icon 108']);
  expect(images.every(img => img.width === 18 && img.height === 18)).toBe(true);
  expect(container.innerHTML).not.toContain('&lt;icon=');
});
it.each(['-1', 'not-a-number', '1.5', '9007199254740992', ''])('uses a labelled fallback for invalid icon token %s without making a request', async token => {
  await render(`Text <icon=${token}> more`);
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('[role=img]')!.getAttribute('aria-label')).toContain('unavailable');
  expect(container.textContent).not.toContain('<icon=');
});
it('replaces a failed image with a readable fallback and recovers when its source changes', async () => {
  await render('<icon=2160>Text');
  await act(async () => container.querySelector('img')!.dispatchEvent(new Event('error')));
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('[role=img]')!.getAttribute('aria-label')).toBe('Official effect icon 2160 unavailable');
  expect(container.textContent).toContain('Text');
  await render('<icon=108>Next'); expect(container.querySelector('img')!.src).toContain('icon_108.png');
});
it('rejects an invalid version without producing a remote image URL', async () => {
  await render('<icon=2160>Text', 'javascript:bad'); expect(container.querySelector('img')).toBeNull();
});
it('keeps arbitrary source HTML and malicious-looking text inert as React text nodes', async () => {
  await render('Before <script>alert(1)</script><img src=x onerror=alert(1)> <icon=2160> after');
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelectorAll('img')).toHaveLength(1);
  expect(container.querySelector('img')!.getAttribute('onerror')).toBeNull();
  expect(container.textContent).toContain('<script>alert(1)</script><img src=x onerror=alert(1)>');
});
it('formats verified percent attributes as signed player-facing percentages (official delta × 100)', async () => {
  await render('{MOD_SKILL_ARCHERY}{0.6}');
  expect(container.textContent).toBe('Archery Base Damage +60%');
  expect(container.textContent).not.toContain('{MOD_');
  expect(container.textContent).not.toMatch(/modifier|source value|context/u);
  await render('{MOD_ABILITY_HEAVYSHOT}{0.625}'); expect(container.textContent).toBe('Heavy Shot Damage +62.5%');
  await render('{DELTA_ANATOMY_CRITICAL_CHANCE}{0.035}'); expect(container.textContent).toBe('Anatomy-Based Critical Hit Chance +3.5%');
  await render('{VULN_NATURE}{-0.18}{Druid}'); expect(container.textContent).toBe('Vulnerability to Nature -18%');
  await render('{ACCURACY_BOOST_RANGED}{0.08}'); expect(container.textContent).toBe('Ranged Accuracy Boost +8%');
  await render('{MOD_CRITICAL_HIT_DAMAGE}{3.15}{Psychology}'); expect(container.textContent).toBe('Psychology/Mentalism Critical Hit Damage +315%');
});
it('shows flat/additive attributes as signed unchanged values and never multiplies them', async () => {
  await render('{MAX_HEALTH}{37}'); expect(container.textContent).toBe('Max Health +37');
  await render('{BOOST_SKILL_ARCHERY}{5}'); expect(container.textContent).toBe('Archery Damage +5');
  await render('{ABILITY_COST_DELTA_ICESPEAR}{-3}'); expect(container.textContent).toBe('Ice Spear Power Cost -3');
  await render('{FLY_INCOMBAT_COST_PER_SEC}{-0.5}'); expect(container.textContent).toBe('Flying Cost (Per Second In Combat) -0.5');
});
it('keeps unestablished scales unchanged with an explicit unverified flag', async () => {
  await render('{MOUNTED_ACCELERATION_LAND}{0.001}');
  expect(container.textContent).toBe('Acceleration (Land) 0.001 (scale unverified)');
  expect(container.querySelector('.effect-value-note')!.getAttribute('title')).toContain('AsDoubleTimes100');
});
it('joins paired Animal Handling attributes into one readable effect with the required active skill as a subtle note', async () => {
  const tier = data.getTreasureTier('power_12192', 'id_25')!;
  expect(tier.effectDescriptions).toEqual(['{MOD_ELECTRICITY_DIRECT}{0.25}{AnimalHandling}', '{MOD_FIRE}{0.25}{AnimalHandling}']);
  await act(async () => root.render(<EffectDescriptions descriptions={tier.effectDescriptions} data={data} />));
  expect(container.textContent).toBe('Direct Electricity Damage +25%, Fire Damage (Direct & Per-Tick) +25%');
  expect(container.querySelector('.effect-description')!.getAttribute('title')).toBe('Direct Electricity Damage +25%, Fire Damage (Direct & Per-Tick) +25% · Requires Animal Handling active');
  const psychic = data.getTreasureTier('power_12194', 'id_25')!;
  await act(async () => root.render(<><EffectDescriptions descriptions={psychic.effectDescriptions} data={data} /><EffectRequirements descriptions={psychic.effectDescriptions} data={data} /></>));
  expect(container.textContent).toBe('Psychic Damage (Direct & Per-Tick) +23%, Direct Crushing Damage +23%Requires Animal Handling active');
});
it('shows supported lines and one explicit fallback when a tier mixes supported and unsupported templates', async () => {
  await act(async () => root.render(<EffectDescriptions descriptions={['{MAX_HEALTH}{10}', '{UNKNOWN_ATTRIBUTE}{1}', '{NOPE}{2}']} data={data} fallback="My power" />));
  expect(container.textContent).toBe('Max Health +10, My power unformatted official effect');
});
it.each(['{UNKNOWN_ATTRIBUTE}{12}', '{MAX_HEALTH}{oops}', '{MAX_HEALTH}{12}{MissingSkill}', '{MOD_SKILL_ARCHERY}{Infinity}', '{weird}<script>bad</script>'])('gives an explicit, safe unsupported fallback for %s', async description => {
  await render(description);
  expect(container.textContent).toBe('My power unformatted official effect');
  expect(container.querySelector('script')).toBeNull();
  expect(container.textContent).not.toContain(description);
});
it('retains byte-exact original strings only in deliberately expanded technical source details', async () => {
  const source = '<icon=2160> Pets & more\n{MOD_ELECTRICITY_DIRECT}{0.25}{AnimalHandling}';
  await act(async () => root.render(<ExactEffects descriptions={[source]} />));
  expect(container.querySelector('details')!.open).toBe(false);
  expect(container.querySelector('pre')!.textContent).toBe(source);
});
it('uses the pinned attribute contract; conversion is exact decimal text, not floating point', () => {
  expect(data.getAttribute('MOD_SKILL_ARCHERY')!.label).toBe('Archery Base Damage %');
  expect(data.getAttribute('MOD_SKILL_ARCHERY')!.displayType).toBe('AsBuffMod');
  expect(presentEffect('{MOD_SKILL_ARCHERY}{0.600}', data)).toMatchObject({ value: '+60%', confidence: 'confirmed', requiredSkill: null });
  expect(presentEffect('{MOD_ELECTRICITY_DIRECT}{0.25}{AnimalHandling}', data)).toMatchObject({ value: '+25%', requiredSkill: 'Animal Handling' });
  expect(['0.25', '0.23', '0.625', '0.035', '-0.01', '.5', '12.5', '3', '0.001', '-0.17', '0'].map(value => shiftDecimal(value, 2)))
    .toEqual(['25', '23', '62.5', '3.5', '-1', '50', '1250', '300', '0.1', '-17', '0']);
  expect(['5', '-3', '+2', '0.50', '-0'].map(signed)).toEqual(['+5', '-3', '+2', '+0.5', '+0']);
  expect(shiftDecimal('abc', 2)).toBeNull();
});
it('formats every published template in the pinned data without NaN or raw tokens', () => {
  let attributes = 0;
  for (const power of data.treasurePowers) for (const tier of power.tiers) for (const description of tier.effectDescriptions) {
    const presentation = presentEffect(description, data);
    if (presentation.kind !== 'attribute') continue;
    attributes += 1;
    expect(presentation.value).not.toMatch(/NaN|[{}]/u);
    if (presentation.confidence !== 'unverified' && presentation.value.endsWith('%')) expect(data.getAttribute(/^\{([A-Z_0-9]+)\}/u.exec(description)![1]!)!.label).toMatch(/%$/u);
  }
  expect(attributes).toBeGreaterThan(20000);
});
it('formats fixed item effects with official labels: signed percents, flat values and booleans', async () => {
  for (const [source, text] of [
    ['{VULN_ELECTRICITY}{-0.2}', 'Vulnerability to Electricity -20%'], ['{VULN_ELECTRICITY}{0.2}', 'Vulnerability to Electricity +20%'],
    ['{VULN_NATURE}{-0.1}', 'Vulnerability to Nature -10%'], ['{MAX_ARMOR}{120}', 'Max Armor +120'], ['{MAX_HEALTH}{37}', 'Max Health +37'],
    ['{COMBAT_REFRESH_ARMOR_DELTA}{45}', 'Armor from Combat Refresh Abilities +45'], ['{FALLING_DAMAGE_MOD}{-0.1}', 'Falling Damage -10%'],
    ['{MOD_SKILL_SHIELD}{0.12}', 'Shield Mastery Base Damage +12%'], ['{SPRINT_BOOST}{1.5}', 'Sprint Speed Boost +1.5'],
    ['{ABILITY_COST_DELTA_SIGNATUREDEBUFF}{-5}', 'Signature Debuff Power Cost -5'],
    ['{ABILITY_WORKSWHILESTUNNED_DELTA_SIGNATURESUPPORT}{1}', 'Signature Support abilities work while stunned: Yes'],
  ] as const) { await render(source); expect(container.textContent).toBe(text); }
  expect(presentEffect('{VULN_ELECTRICITY}{-0.2}', data)).toMatchObject({ confidence: 'confirmed', displayType: 'AsDebuffMod' });
  expect(presentEffect('{ACCURACY_BOOST_RANGED}{0.1}', data)).toMatchObject({ value: '+10%', confidence: 'inferred' });
  await render('{ACCURACY_BOOST_RANGED}{0.1}');
  expect(container.querySelector('.effect-value')!.getAttribute('title')).toContain('inferred');
  expect(presentEffect('{ABILITY_WORKSWHILESTUNNED_DELTA_SIGNATURESUPPORT}{2}', data)).toMatchObject({ value: '2', confidence: 'unverified' });
});
it('formats every published fixed item effect without raw tokens, NaN or a skill requirement', () => {
  let templates = 0;
  for (const item of data.items) for (const effect of item.fixedEffects ?? []) {
    const presentation = presentEffect(effect.description, data);
    expect(presentation.kind).not.toBe('unsupported');
    if (presentation.kind !== 'attribute') continue;
    templates += 1;
    expect(presentation.value).not.toMatch(/NaN|[{}]/u);
    expect(presentation.requiredSkill).toBeNull();
  }
  expect(templates).toBeGreaterThan(8000);
});
