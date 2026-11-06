// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import type { EquipmentSelection } from './document';
import { editSparks, sparksAfterReplacement } from './sparks';
import { validateBuildDocument } from './validation';
import { createDefaultBuildDocument } from './document';
import { SKILL_DAMAGE_SPARK_MODEL_VERSION, simulateSkillDamageSparks, zeroSparkOutcomeCounts } from '../sparks';

let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });

const ring = (): EquipmentSelection => ({
  slot: 'Ring', item: { kind: 'imported', instance: { baseItemId: 'item_49070', displayName: 'Keep me', existingPowers: [{ powerId: 'power_129', tierId: 'id_120' }], metadata: { sourceItem: { kept: true } } } },
  candidateMods: [{ powerId: 'power_10001', tierId: 'id_9' }], sparks: { mode: 'none' },
});
const manual = { allDirectDamagePercent: 11, skillDamageFlat: 44, allDirectDamageFlat: 11, skillDamagePercent: 26, skillBaseDamagePercent: 18 };

describe('T0015 editSparks', () => {
  it('stores a simulated configuration with a computed, versioned, reproducible result', () => {
    const original = ring();
    const next = editSparks(original, { mode: 'simulated', skillId: 'Psychology', count: 110, seed: 'abc' }, data);
    const expected = simulateSkillDamageSparks({ skill: 'Psychology', count: 110, seed: 'abc' });
    if (!expected.ok) throw new Error('simulate');
    expect(next.sparks).toEqual({ mode: 'simulated', input: { category: 'skill-damage', skillId: 'Psychology', count: 110, seed: 'abc' }, result: expected.value });
    expect(next.sparks.mode === 'simulated' && next.sparks.result?.modelVersion).toBe(SKILL_DAMAGE_SPARK_MODEL_VERSION);
    // Instance data, candidates and slot are untouched (same references).
    expect(next.item).toBe(original.item); expect(next.candidateMods).toBe(original.candidateMods); expect(next.slot).toBe('Ring');
    expect(original.sparks).toEqual({ mode: 'none' });
  });

  it('a reroll (new seed) replaces both the seed and the outcomes; repeating the same request is a no-op', () => {
    const first = editSparks(ring(), { mode: 'simulated', skillId: 'Psychology', count: 110, seed: 'one' }, data);
    expect(editSparks(first, { mode: 'simulated', skillId: 'Psychology', count: 110, seed: 'one' }, data)).toBe(first);
    const second = editSparks(first, { mode: 'simulated', skillId: 'Psychology', count: 110, seed: 'two' }, data);
    if (first.sparks.mode !== 'simulated' || second.sparks.mode !== 'simulated') throw new Error('mode');
    expect(second.sparks.input.seed).toBe('two');
    expect(second.sparks.result?.outcomeCounts).not.toEqual(first.sparks.result?.outcomeCounts);
  });

  it('stores manual actual results exactly, without RNG', () => {
    const original = Math.random;
    Math.random = () => { throw new Error('no RNG'); };
    try {
      const next = editSparks(ring(), { mode: 'actual', skillId: 'Psychology', outcomeCounts: manual }, data);
      expect(next.sparks).toEqual({ mode: 'actual', category: 'skill-damage', skillId: 'Psychology', outcomeCounts: manual });
    } finally { Math.random = original; }
  });

  it.each([
    ['count above 110', { mode: 'simulated', skillId: 'Psychology', count: 111, seed: 'x' }],
    ['negative count', { mode: 'simulated', skillId: 'Psychology', count: -1, seed: 'x' }],
    ['fractional count', { mode: 'simulated', skillId: 'Psychology', count: 2.5, seed: 'x' }],
    ['empty seed', { mode: 'simulated', skillId: 'Psychology', count: 5, seed: '' }],
    ['unknown skill', { mode: 'simulated', skillId: 'NotASkill', count: 5, seed: 'x' }],
    ['non-combat skill', { mode: 'actual', skillId: 'Cooking', outcomeCounts: manual }],
    ['manual total above 110', { mode: 'actual', skillId: 'Psychology', outcomeCounts: { ...manual, skillDamageFlat: 45 } }],
    ['negative manual count', { mode: 'actual', skillId: 'Psychology', outcomeCounts: { ...zeroSparkOutcomeCounts(), skillDamageFlat: -1 } }],
    ['fractional manual count', { mode: 'actual', skillId: 'Psychology', outcomeCounts: { ...zeroSparkOutcomeCounts(), skillDamageFlat: 1.5 } }],
  ] as const)('rejects %s without changing the selection', (_, request) => {
    const original = ring();
    expect(editSparks(original, request as Parameters<typeof editSparks>[1], data)).toBe(original);
  });

  it('only offers Sparks on MainHand, OffHand/OffHandShield, Ring and Necklace, and never on a conflicting offhand', () => {
    const request = { mode: 'simulated', skillId: 'Psychology', count: 10, seed: 'x' } as const;
    for (const slot of ['MainHand', 'OffHand', 'OffHandShield', 'Ring', 'Necklace']) expect(editSparks({ ...ring(), slot }, request, data).sparks.mode).toBe('simulated');
    for (const slot of ['Head', 'Chest', 'Hands', 'Feet', 'Legs', 'Waist']) {
      const selection = { ...ring(), slot };
      expect(editSparks(selection, request, data)).toBe(selection);
    }
    const offhand = { ...ring(), slot: 'OffHand' };
    expect(editSparks(offhand, request, data, { offhandConflict: true })).toBe(offhand);
    expect(editSparks({ ...ring(), slot: 'Ring' }, request, data, { offhandConflict: true }).sparks.mode).toBe('simulated');
  });

  it('clearing always works (including legacy configurations on unsupported slots) and produces schema-valid builds', () => {
    const configured = editSparks(ring(), { mode: 'actual', skillId: 'Psychology', outcomeCounts: manual }, data);
    const cleared = editSparks(configured, { mode: 'none' }, data);
    expect(cleared.sparks).toEqual({ mode: 'none' });
    const legacy: EquipmentSelection = { ...ring(), slot: 'Head', sparks: { mode: 'actual', category: 'skill-damage', skillId: 'Cow', outcomeCounts: manual } };
    expect(editSparks(legacy, { mode: 'none' }, data, { offhandConflict: true }).sparks).toEqual({ mode: 'none' });
    const none = ring();
    expect(editSparks(none, { mode: 'none' }, data)).toBe(none);
    const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
    build.equipment = [configured, editSparks(ring(), { mode: 'simulated', skillId: 'Cow', count: 0, seed: 'zero' }, data)];
    expect(validateBuildDocument(build).ok).toBe(true);
  });

  it('replacement clears configured Sparks and keeps an unconfigured value by reference', () => {
    const none = ring();
    expect(sparksAfterReplacement(none)).toBe(none.sparks);
    expect(sparksAfterReplacement(editSparks(ring(), { mode: 'simulated', skillId: 'Psychology', count: 3, seed: 'x' }, data))).toEqual({ mode: 'none' });
  });
});
