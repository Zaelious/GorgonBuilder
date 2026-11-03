import { describe, expect, it } from 'vitest';
import { createDefaultBuildDocument, type TargetConfiguration } from './document';
import { configuredTargetDamageTypes, setTargetCount, setTargetDamageTypePercent } from './target';
import { validateBuildDocument } from './validation';

const base = (): TargetConfiguration => ({ count: 1, damageTypes: {} });

describe('T0014 target dummy settings', () => {
  it('clamps enemy count to whole numbers 1–20 and returns the same object when unchanged', () => {
    const target = base();
    expect(setTargetCount(target, 1)).toBe(target);
    expect(setTargetCount(target, 5).count).toBe(5);
    expect(setTargetCount(target, 0).count).toBe(1);
    expect(setTargetCount(target, -3)).toBe(target);
    expect(setTargetCount(target, 21).count).toBe(20);
    expect(setTargetCount(target, 99).count).toBe(20);
    expect(setTargetCount(target, 2.6).count).toBe(3);
    expect(setTargetCount(target, Number.NaN)).toBe(target);
    expect(setTargetCount(target, Number.POSITIVE_INFINITY)).toBe(target);
  });

  it('sets and clears per-damage-type percentages without touching other types or metadata', () => {
    let target: TargetConfiguration = { count: 2, damageTypes: { Fire: { resistance: 10, metadata: { note: 'keep' } } }, metadata: { dummy: 'x' } };
    target = setTargetDamageTypePercent(target, 'Psychic', 'vulnerability', 25);
    expect(target.damageTypes).toEqual({ Fire: { resistance: 10, metadata: { note: 'keep' } }, Psychic: { vulnerability: 25 } });
    target = setTargetDamageTypePercent(target, 'Psychic', 'resistance', 5);
    expect(target.damageTypes.Psychic).toEqual({ vulnerability: 25, resistance: 5 });
    expect(configuredTargetDamageTypes(target)).toEqual(['Fire', 'Psychic']);
    target = setTargetDamageTypePercent(target, 'Psychic', 'vulnerability', 0);
    target = setTargetDamageTypePercent(target, 'Psychic', 'resistance', null);
    expect(target.damageTypes).not.toHaveProperty('Psychic');
    target = setTargetDamageTypePercent(target, 'Fire', 'resistance', 0);
    // An entry that still carries metadata is kept.
    expect(target.damageTypes.Fire).toEqual({ metadata: { note: 'keep' } });
    expect(target.metadata).toEqual({ dummy: 'x' });
    expect(target.count).toBe(2);
    expect(configuredTargetDamageTypes(target)).toEqual([]);
  });

  it('rejects invalid values and blank damage types, and is a no-op for unchanged values', () => {
    const target = setTargetDamageTypePercent(base(), 'Fire', 'vulnerability', 10);
    expect(setTargetDamageTypePercent(target, 'Fire', 'vulnerability', 10)).toBe(target);
    expect(setTargetDamageTypePercent(target, 'Fire', 'vulnerability', -1)).toBe(target);
    expect(setTargetDamageTypePercent(target, 'Fire', 'vulnerability', 1001)).toBe(target);
    expect(setTargetDamageTypePercent(target, 'Fire', 'vulnerability', Number.NaN)).toBe(target);
    expect(setTargetDamageTypePercent(target, ' ', 'vulnerability', 5)).toBe(target);
    expect(setTargetDamageTypePercent(base(), 'Fire', 'resistance', 0).damageTypes).toEqual({});
  });

  it('keeps BuildDocument v1 valid (no schema change)', () => {
    const build = createDefaultBuildDocument({ gameDataVersion: 'v490' });
    build.target = setTargetDamageTypePercent(setTargetCount(build.target, 20), 'Piercing', 'resistance', 12.5);
    expect(validateBuildDocument(build).ok).toBe(true);
    expect(build.schemaVersion).toBe(1);
  });
});
