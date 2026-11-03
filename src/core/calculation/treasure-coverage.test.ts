// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { classifyTreasureEffect, type TreasureCoverageRow } from './treasure-coverage';

it('the committed inventory contains every official power/tier/effect exactly once with unchanged source text', () => {
  const data = loadPlannerFixture();
  const rows = JSON.parse(gunzipSync(readFileSync('docs/treasure-coverage/effects.json.gz')).toString()) as TreasureCoverageRow[];
  const byKey = new Map(rows.map(r => [`${r.powerId}/${r.tierId}/${r.effectIndex}`, r]));
  expect(rows).toHaveLength(52039);
  expect(byKey.size).toBe(rows.length);
  let count = 0;
  for (const power of data.treasurePowers) for (const tier of power.tiers) tier.effectDescriptions.forEach((description, index) => {
    const row = byKey.get(`${power.id}/${tier.id}/${index}`);
    if (row?.description !== description || row.internalName !== power.internalName) throw Error(`Inventory mismatch ${power.id}/${tier.id}/${index}`);
    if (row.damageRelevant && (!row.before.reason || !row.after.reason)) throw Error('Missing support reason');
    count++;
  });
  expect(count).toBe(rows.length);
  for (const skill of data.skills.filter(s => s.combat)) {
    const relevant = rows.filter(r => r.skill === skill.id && r.damageRelevant);
    expect(relevant.filter(r => ['fully-modeled', 'partially-modeled', 'unmodeled'].includes(r.after.status))).toHaveLength(relevant.length);
  }
});

it.each([
  ['{MAX_HEALTH}{5}', 'MAX_HEALTH', 'Max Health', false, 'non-damage-stat'],
  ['{MOD_SKILL_COW}{0.2}', 'MOD_SKILL_COW', 'Cow Base Damage %', true, 'skill-base'],
  ['Deal 50 damage over 10 seconds', null, null, true, 'indirect-dot'],
  ['Your next attack deals +10 damage', null, null, true, 'conditional-stateful'],
  ['You take 10% less damage', null, null, false, 'incoming-defense'],
  ['Damage shield reflects 20 damage', null, null, true, 'reactive-damage'],
  ['Missing attribute', 'MISSING', null, null, 'unresolved-attribute'],
] as const)('screens relevance without executing prose: %s', (text, id, label, relevant, family) => {
  expect(classifyTreasureEffect(text, id, label)).toEqual({ relevant, family });
});
