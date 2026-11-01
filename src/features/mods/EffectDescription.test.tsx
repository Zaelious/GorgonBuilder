import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { EffectDescription, ExactEffects } from './EffectDescription';
import { presentEffect } from './effect-description';
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
it('uses exact official labels and source numbers without guessing percentage scaling or baseline subtraction', async () => {
  await render('{MOD_SKILL_ARCHERY}{0.6}');
  expect(container.textContent).toBe('Archery Base Damage modifier: 0.6 source value');
  expect(container.textContent).not.toContain('60%');
  expect(container.textContent).not.toContain('{MOD_');
  expect(container.querySelector('.effect-value-note')!.getAttribute('title')).toContain('unverified');
  await render('{MAX_HEALTH}{37}'); expect(container.textContent).toBe('Max Health: 37');
});
it('shows resolved third arguments as published context without inventing applicability', async () => {
  await render('{MOD_ELECTRICITY_DIRECT}{0.25}{AnimalHandling}');
  expect(container.textContent).toBe('Direct Electricity Damage modifier: 0.25 · context: Animal Handling source value');
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
it('uses the pinned attribute contract and leaves numeric source text unchanged', () => {
  expect(data.getAttribute('MOD_SKILL_ARCHERY')!.label).toBe('Archery Base Damage %');
  expect(data.getAttribute('MOD_SKILL_ARCHERY')!.displayType).toBe('AsBuffMod');
  expect(presentEffect('{MOD_SKILL_ARCHERY}{0.600}', data)).toMatchObject({ value: '0.600', sourceValue: true });
});
