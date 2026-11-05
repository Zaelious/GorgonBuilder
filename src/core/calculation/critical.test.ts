// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { createDefaultBuildDocument, type BuildDocument, type CandidateMod, type EquipmentSelection } from '../build/document';
import type { ImportedCharacterSnapshot, ImportedSkill } from '../import/contracts';
import { aggregateBuildModifiers, type AggregateOptions } from './aggregate';
import { calculateAbilityDamage } from './ability-damage';
import { CRITICAL_ASSUMPTIONS, calculateCriticalHit, type CriticalInputs } from './critical-damage';
import {
  CRITICAL_SYSTEMS, creatureTypes, criticalChanceAtLevel, criticalChanceTable, getCreatureType, resolveAbilityCriticalSystem,
} from './critical-rules';
import {
  importedCriticalSkill, importedCriticalSkillSummary, resolveCriticalSkillLevel, setManualCriticalLevel, type ManualCriticalLevels,
} from './critical-skills';
import { psychologyFixture } from './fixtures';
import { CRITICAL_TREASURE_RULES } from './critical-treasure-rules';
import { interpretTreasureEffect } from './treasure-effect-rules';
import { applyTargetDummy } from './target-damage';

let data: ReturnType<typeof loadPlannerFixture>;
beforeAll(() => { data = loadPlannerFixture(); });

const MOCK = 'ability_6553';          // Psychology Mock 11: HealthSpecificDamage 178, PhrenologyCriticals, CritDamageMod 1.25
const AIMED_SHOT = 'ability_2535';    // Archery Aimed Shot 5: Damage 231, AnatomyCriticals, CritDamageMod 1.25
const BLITZ_SHOT = 'ability_2501';    // Archery Blitz Shot 1: Damage 13
const CROSSBOW = 'ability_8301';      // Crossbow Shoot Crossbow 1: Damage 186, CritDamageMod 1.5
const SYSTEM_SHOCK = 'ability_2330';  // Mentalism System Shock 1: Damage 23, ability-specific crit damage hook
const FAIRY_FIRE = 'ability_2421';    // Fairy Magic: PhrenologyCriticals keyword, notes name only Mentalism/Psychology
const FAN_OF_BLADES = 'ability_6841'; // Knife: AnatomyCriticals only through a conditional effect keyword
const RESTORATIVE = 'ability_2631';   // Archery: CritDamageMod without a critical keyword
const FLASHING_STRIKE = 'ability_1187'; // Sword: no critical system
const DECAPITATE = 'ability_1180';

const equip = (slot: string, candidateMods: CandidateMod[]): EquipmentSelection =>
  ({ slot, item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } }, candidateMods, sparks: { mode: 'none' } });

function build(skillA: string, skillB: string | null, equipment: EquipmentSelection[] = []): BuildDocument {
  const doc = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  return { ...doc, skillSlotA: { skillId: skillA, level: 0 }, skillSlotB: { skillId: skillB, level: 0 }, equipment };
}

function levels(map: Record<string, number>): CriticalInputs['skillLevel'] {
  return skillId => resolveCriticalSkillLevel(skillId, { manualLevels: map }, data);
}

function critical(abilityId: string, doc: BuildDocument, creatureType: string | null, manual: Record<string, number> = {}, options: AggregateOptions = {}) {
  const result = calculateAbilityDamage(abilityId, aggregateBuildModifiers(doc, data, options), data);
  const target = applyTargetDummy(result, doc.target);
  return { result, target, critical: calculateCriticalHit(result, target, { creatureType, skillLevel: levels(manual) }, data) };
}

function snapshot(skills: Partial<ImportedSkill>[], version?: string): ImportedCharacterSnapshot {
  return {
    source: { report: 'CharacterSheet', exportedAt: '2026-11-01T12:00:00Z', sourceReportVersion: 1, characterName: 'Fixture', server: null,
      resolvedWithGameDataVersion: version ?? data.gameDataVersion, metadata: {} },
    skills: skills.map(skill => ({ reference: { sourceId: 'x', id: null, status: 'unresolved' }, level: 0, bonusLevels: null, xpTowardNextLevel: null,
      xpNeededForNextLevel: null, abilities: [], metadata: {}, ...skill })),
    knownAbilities: [], currentStats: {},
  };
}
const resolved = (id: string, level: number, bonusLevels: number | null = null): Partial<ImportedSkill> =>
  ({ reference: { sourceId: id, id, status: 'resolved' }, level, bonusLevels });

describe('official critical rules (v490)', () => {
  it('derives creature categories from Anatomy sub-skills and pairs every Phrenology sub-skill exactly once', () => {
    const types = creatureTypes(data);
    expect(types).toHaveLength(27);
    expect(types.find(t => t.id === 'Anatomy_Humans')).toEqual({ id: 'Anatomy_Humans', label: 'Human', anatomySkillId: 'Anatomy_Humans', phrenologySkillId: 'Phrenology_Humans' });
    expect(getCreatureType('Anatomy_Fey', data)?.phrenologySkillId).toBe('Phrenology_Fae'); // reviewed naming alias
    expect(getCreatureType('Anatomy_Canines', data)?.phrenologySkillId).toBeNull();
    const phrenology = types.flatMap(t => t.phrenologySkillId ? [t.phrenologySkillId] : []);
    const published = data.skills.filter(s => s.id.startsWith('Phrenology_') && criticalChanceTable(s.id, data)).map(s => s.id);
    expect(new Set(phrenology)).toEqual(new Set(published));
    expect(phrenology).toHaveLength(11);
    expect(getCreatureType('NotACreature', data)).toBeNull();
  });

  it('reads published sub-skill notes with their running totals', () => {
    const human = criticalChanceTable('Phrenology_Humans', data)!;
    expect(human).toMatchObject({ status: 'resolved', system: 'phrenology', appliesToSkillIds: ['Mentalism', 'Psychology'] });
    expect(human.thresholds.map(t => [t.level, t.total])).toEqual([[6, 0.01], [12, 0.02], [18, 0.03], [24, 0.04], [30, 0.05], [36, 0.06], [42, 0.07], [48, 0.08]]);
    const undead = criticalChanceTable('Anatomy_Undead', data)!;
    expect(undead).toMatchObject({ status: 'resolved', system: 'anatomy', appliesToSkillIds: ['Archery', 'Crossbow'] });
    expect(undead.thresholds.map(t => [t.level, t.total])).toEqual([[8, 0.01], [16, 0.02], [24, 0.03], [32, 0.04], [40, 0.05], [48, 0.06]]);
    for (const type of creatureTypes(data)) {
      expect(criticalChanceTable(type.anatomySkillId, data)?.status).toBe('resolved');
      if (type.phrenologySkillId) expect(criticalChanceTable(type.phrenologySkillId, data)?.status).toBe('resolved');
    }
    // Multi-line official notes (critical line plus a butchering line) are read line by line.
    expect(criticalChanceTable('Anatomy_Arthropods', data)!.thresholds.map(t => [t.level, t.total])).toEqual([[8, 0.01], [16, 0.02], [24, 0.03], [32, 0.04], [40, 0.05], [48, 0.06]]);
    expect(criticalChanceTable('Psychology', data)).toBeNull();
    expect(criticalChanceTable('Anatomy', data)).toBeNull(); // umbrella skill publishes no chance notes
  });

  it('applies thresholds at or below the effective level only', () => {
    const table = criticalChanceTable('Phrenology_Humans', data)!;
    expect(criticalChanceAtLevel(table, 0)!.chance).toBe(0);
    expect(criticalChanceAtLevel(table, 5)!.chance).toBe(0);
    expect(criticalChanceAtLevel(table, 6)!.chance).toBe(0.01);
    expect(criticalChanceAtLevel(table, 47)!.chance).toBe(0.07);
    expect(criticalChanceAtLevel(table, 60)!.chance).toBe(0.08); // above the last note: last published total
    expect(criticalChanceAtLevel(table, -1)).toBeNull();
    expect(criticalChanceAtLevel(table, 12.5)).toBeNull();
  });

  it('resolves critical systems only from official keywords', () => {
    const system = (id: string) => resolveAbilityCriticalSystem(data.getAbility(id)!, data);
    expect(system(MOCK)).toMatchObject({ status: 'supported', system: 'phrenology', critDamageMod: 1.25, chanceHooks: [], damageHooks: ['MOD_CRITICAL_HIT_DAMAGE'] });
    expect(system(AIMED_SHOT)).toMatchObject({ status: 'supported', system: 'anatomy', critDamageMod: 1.25,
      chanceHooks: ['ABILITY_CRIT_CHANCE_DELTA_AIMEDSHOT', 'DELTA_ANATOMY_CRITICAL_CHANCE'], damageHooks: ['MOD_CRITICAL_HIT_DAMAGE_ANATOMY'] });
    expect(system(CROSSBOW)).toMatchObject({ status: 'supported', system: 'anatomy', critDamageMod: 1.5 });
    expect(system(SYSTEM_SHOCK)).toMatchObject({ damageHooks: ['ABILITY_CRITICAL_HIT_DAMAGE_MOD_SYSTEMSHOCK', 'MOD_CRITICAL_HIT_DAMAGE'] });
    expect(system(FAN_OF_BLADES)).toMatchObject({ status: 'conditional', system: 'anatomy', requiredEffectKeywords: ['ThrownKnifeAnatomyCriticals'] });
    expect(system(RESTORATIVE).status).toBe('unresolved');
    expect(system(FLASHING_STRIKE).status).toBe('none');
    expect(CRITICAL_SYSTEMS.phrenology.keyword).toBe('PhrenologyCriticals');
  });
});

describe('imported and manual critical skill levels', () => {
  it('uses exported Level directly (BonusLevels already included) and never invents missing levels', () => {
    const snap = snapshot([resolved('Phrenology_Humans', 30, 5), resolved('Psychology', 90, 5), { reference: { sourceId: 'Phrenology_Mystery', id: null, status: 'unresolved' }, level: 40 }]);
    expect(importedCriticalSkill(snap, 'Phrenology_Humans', data)).toMatchObject({ status: 'resolved', level: 30, bonusLevels: 5, sourceName: 'Phrenology_Humans' });
    expect(importedCriticalSkill(snap, 'Phrenology_Orcs', data)).toMatchObject({ status: 'missing' });
    expect(importedCriticalSkill(undefined, 'Phrenology_Orcs', data)).toBeNull();
    expect(importedCriticalSkill(snapshot([resolved('Phrenology_Humans', 30)], 'v1'), 'Phrenology_Humans', data)).toMatchObject({ status: 'version-mismatch' });
    expect(importedCriticalSkill(snapshot([resolved('Phrenology_Humans', 30), resolved('Phrenology_Humans', 31)]), 'Phrenology_Humans', data)).toMatchObject({ status: 'ambiguous' });
    expect(importedCriticalSkill(snapshot([resolved('Phrenology_Humans', -3)]), 'Phrenology_Humans', data)).toMatchObject({ status: 'invalid' });
    expect(importedCriticalSkillSummary(snap, data)).toEqual({ resolvedCount: 1, unresolvedSourceNames: ['Phrenology_Mystery'] });
    const missing = resolveCriticalSkillLevel('Phrenology_Orcs', { snapshot: snap, manualLevels: {} }, data);
    expect(missing).toMatchObject({ level: null, origin: null });
  });

  it('applies the manual-over-imported precedence and supports a deliberate return to imported values', () => {
    const snap = snapshot([resolved('Phrenology_Humans', 30, 5)]);
    let manual: ManualCriticalLevels = {};
    expect(resolveCriticalSkillLevel('Phrenology_Humans', { snapshot: snap, manualLevels: manual }, data)).toMatchObject({ level: 30, origin: 'imported' });
    manual = setManualCriticalLevel(manual, 'Phrenology_Humans', 48);
    expect(resolveCriticalSkillLevel('Phrenology_Humans', { snapshot: snap, manualLevels: manual }, data)).toMatchObject({ level: 48, origin: 'manual', imported: { level: 30 } });
    // Reimport replaces only the snapshot; the manual scenario choice survives.
    const reimported = snapshot([resolved('Phrenology_Humans', 36, 6)]);
    expect(resolveCriticalSkillLevel('Phrenology_Humans', { snapshot: reimported, manualLevels: manual }, data)).toMatchObject({ level: 48, origin: 'manual', imported: { level: 36 } });
    manual = setManualCriticalLevel(manual, 'Phrenology_Humans', null); // "Use imported"
    expect(resolveCriticalSkillLevel('Phrenology_Humans', { snapshot: reimported, manualLevels: manual }, data)).toMatchObject({ level: 36, origin: 'imported' });
    // Manual values work without any import; invalid inputs are ignored.
    expect(resolveCriticalSkillLevel('Phrenology_Orcs', { manualLevels: { Phrenology_Orcs: 12 } }, data)).toMatchObject({ level: 12, origin: 'manual', imported: null });
    expect(setManualCriticalLevel(manual, 'Phrenology_Orcs', 2.5)).toBe(manual);
    expect(setManualCriticalLevel(manual, 'Phrenology_Orcs', 9999)).toBe(manual);
    expect(resolveCriticalSkillLevel('Phrenology_Orcs', { manualLevels: { Phrenology_Orcs: -1 } }, data).level).toBeNull();
  });
});

describe('critical stage', () => {
  it('Phrenology: imported Human level, published 1.25 multiplier and the expected-value identity', () => {
    const { target, critical: out } = critical(MOCK, build('Psychology', null), 'Anatomy_Humans', { Phrenology_Humans: 30 });
    expect(out.status).toBe('calculated');
    expect(out.skillId).toBe('Phrenology_Humans');
    expect(out.chance.value).toBe(0.05);
    expect(out.multiplier.value).toBe(1.25);
    const hit = out.hits[0]!;
    expect(hit.normal).toBe(178);
    expect(hit.critical).toBe(222.5);
    expect(hit.expected).toBeCloseTo(178 * 0.95 + 222.5 * 0.05, 10); // 180.225
    expect(target.hits[0]!.perTarget).toBe(178); // normal hit untouched
    expect(out.assumptions).toEqual(expect.arrayContaining([CRITICAL_ASSUMPTIONS.chanceNotes, CRITICAL_ASSUMPTIONS.multiplierBase, CRITICAL_ASSUMPTIONS.afterTarget]));
  });

  it('irrelevant creature-specific levels never change chance; categories without Phrenology give a valid 0%', () => {
    const doc = build('Psychology', null);
    const orc = critical(MOCK, doc, 'Anatomy_Orcs', { Phrenology_Humans: 48 }).critical;
    expect(orc.skillId).toBe('Phrenology_Orcs');
    expect(orc.chance.value).toBeNull(); // the Orc level is unknown, not zero
    expect(orc.hits[0]!.critical).toBe(222.5); // multiplier still known
    const canine = critical(MOCK, doc, 'Anatomy_Canines', { Phrenology_Humans: 48 }).critical;
    expect(canine.chance.value).toBe(0);
    expect(canine.hits[0]!.expected).toBe(178);
    expect(canine.assumptions).toContain(CRITICAL_ASSUMPTIONS.noPhrenologySubskill);
    const unknown = critical(MOCK, doc, null, { Phrenology_Humans: 48 }).critical;
    expect(unknown.chance.value).toBeNull();
    expect(unknown.chance.reason).toMatch(/Select a creature type/u);
    expect(unknown.hits[0]!.expected).toBeNull();
    // Phrenology level below its first note is a valid 0%.
    expect(critical(MOCK, doc, 'Anatomy_Humans', { Phrenology_Humans: 5 }).critical.hits[0]!.expected).toBe(178);
  });

  it('Psychology crit damage gear applies once, needs Psychology active and never changes normal damage', () => {
    const doc = psychologyFixture(data.gameDataVersion); // includes planned power_4009/id_9 {MOD_CRITICAL_HIT_DAMAGE}{0.9}{Psychology}
    const { target, critical: out } = critical(MOCK, doc, 'Anatomy_Humans', { Phrenology_Humans: 48 });
    expect(target.hits[0]!.perTarget).toBe(526.7);
    expect(out.multiplier.value).toBe(2.15);
    expect(out.multiplier.steps.map(s => [s.kind, s.amount])).toEqual([['base', 1.25], ['modifier', 0.9]]);
    expect(out.hits[0]!.critical).toBeCloseTo(526.7 * 2.15, 10);
    expect(out.hits[0]!.expected).toBeCloseTo(526.7 * 0.92 + 526.7 * 2.15 * 0.08, 10);
    // Without Psychology active the requirement fails and the base multiplier remains.
    const inactive = { ...doc, skillSlotA: { skillId: 'Mentalism', level: 0 }, skillSlotB: { skillId: null, level: 0 } };
    expect(critical(MOCK, inactive, 'Anatomy_Humans', { Phrenology_Humans: 48 }).critical.multiplier.value).toBe(1.25);
    // Removing the crit mod restores the previous critical result without touching the normal hit.
    const removed = { ...doc, equipment: doc.equipment.map(e => ({ ...e, candidateMods: e.candidateMods.filter(m => m.powerId !== 'power_4009') })) };
    const restored = critical(MOCK, removed, 'Anatomy_Humans', { Phrenology_Humans: 48 });
    expect(restored.target.hits[0]!.perTarget).toBe(526.7);
    expect(restored.critical.multiplier.value).toBe(1.25);
  });

  it('high critical-damage scenario: Psychology + Mentalism L125 tiers stack additively onto 1.25', () => {
    const doc = build('Psychology', 'Mentalism', [equip('Chest', [{ powerId: 'power_4009', tierId: 'id_25' }]), equip('Head', [{ powerId: 'power_9009', tierId: 'id_25' }])]);
    const out = critical(MOCK, doc, 'Anatomy_Humans', { Phrenology_Humans: 48 }).critical;
    expect(out.multiplier.value).toBe(6.9); // 1.25 + 3.15 + 2.5
    expect(out.hits[0]!.critical).toBeCloseTo(178 * 6.9, 10);
    expect(out.hits[0]!.expected).toBeCloseTo(178 * 0.92 + 178 * 6.9 * 0.08, 10);
    expect(out.assumptions).toContain(CRITICAL_ASSUMPTIONS.multiplierAdditive);
    // Reproduces the wiki's 5.05 example arithmetic with tiers id_18 (2.1) and id_17 (1.7) — a consistency check only.
    const wiki = build('Psychology', 'Mentalism', [equip('Chest', [{ powerId: 'power_4009', tierId: 'id_18' }]), equip('Head', [{ powerId: 'power_9009', tierId: 'id_17' }])]);
    expect(critical(MOCK, wiki, 'Anatomy_Humans').critical.multiplier.value).toBe(5.05);
  });

  it('working imported power and equivalent planned candidate are separate sources; exact tiers are used', () => {
    const imported: EquipmentSelection = { slot: 'Chest', candidateMods: [], sparks: { mode: 'none' },
      item: { kind: 'imported', instance: { baseItemId: null, existingPowers: [{ powerId: 'power_4009', tierId: 'id_20' }] } } };
    const one = critical(MOCK, build('Psychology', null, [imported]), 'Anatomy_Humans').critical;
    expect(one.multiplier.value).toBe(3.65); // 1.25 + 2.4
    const both = critical(MOCK, build('Psychology', null, [imported, equip('Hands', [{ powerId: 'power_4009', tierId: 'id_19' }])]), 'Anatomy_Humans').critical;
    expect(both.multiplier.steps.filter(s => s.kind === 'modifier').map(s => s.amount)).toEqual([2.4, 2.25]);
    expect(both.multiplier.value).toBe(5.9);
    const unrelated = critical(MOCK, build('Psychology', null, [equip('Head', [{ powerId: 'power_10009', tierId: 'id_25' }])]), 'Anatomy_Humans').critical;
    expect(unrelated.multiplier.value).toBe(1.25); // Anatomy crit damage never affects Phrenology criticals
    expect(unrelated.decisions.map(d => d.status)).toEqual(['excluded']);
  });

  it('Anatomy: sub-skill chance plus Anatomy chance gear; published multiplier conflict stays explicit', () => {
    const doc = build('Archery', null, [equip('Head', [{ powerId: 'power_10001', tierId: 'id_10' }]), equip('MainHand', [{ powerId: 'power_10009', tierId: 'id_20' }])]);
    const { target, critical: out } = critical(AIMED_SHOT, doc, 'Anatomy_Undead', { Anatomy_Undead: 24 });
    expect(out.chance.steps.map(s => [s.kind, s.amount])).toEqual([['skill', 0.03], ['modifier', 0.03]]);
    expect(out.chance.value).toBe(0.06);
    expect(out.multiplier.value).toBe(1.735); // 1.25 + 0.485
    expect(out.assumptions).toContain(CRITICAL_ASSUMPTIONS.anatomyConflict);
    const normal = target.hits[0]!.perTarget!;
    expect(out.hits[0]!.expected).toBeCloseTo(normal * 0.94 + normal * 1.735 * 0.06, 10);
    // Phrenology levels never affect Anatomy-based crits.
    expect(critical(AIMED_SHOT, doc, 'Anatomy_Humans', { Phrenology_Humans: 48 }).critical.chance.value).toBeNull();
    // Crossbow publishes 1.5, matching the wiki default.
    const bolt = critical(CROSSBOW, build('Crossbow', null), 'Anatomy_Undead', { Anatomy_Undead: 48 }).critical;
    expect(bolt.multiplier.value).toBe(1.5);
    expect(bolt.assumptions).toContain(CRITICAL_ASSUMPTIONS.multiplierBase);
    expect(bolt.chance.value).toBe(0.06);
  });

  it('curated Blitz/Aimed Shot crit chance applies only to its own ability', () => {
    const doc = build('Archery', null, [equip('Legs', [{ powerId: 'power_10402', tierId: 'id_25' }, { powerId: 'power_10045', tierId: 'id_25' }])]);
    const blitz = critical(BLITZ_SHOT, doc, 'Anatomy_Humans', { Anatomy_Humans: 0 }).critical;
    expect(blitz.chance.steps.map(s => [s.label, s.amount])).toEqual([['Human Anatomy Lv 0', 0], ['Blitz Shot Crit Chance Bonus %', 0.15]]);
    const aimed = critical(AIMED_SHOT, doc, 'Anatomy_Humans', { Anatomy_Humans: 0 }).critical;
    expect(aimed.chance.value).toBe(0.16);
    // Tiers 1–10 publish no crit clause and add none.
    const low = critical(BLITZ_SHOT, build('Archery', null, [equip('Legs', [{ powerId: 'power_10402', tierId: 'id_10' }])]), 'Anatomy_Humans', { Anatomy_Humans: 0 }).critical;
    expect(low.chance.value).toBe(0);
  });

  it('unsupported critical systems and missing inputs remain unavailable rather than numeric', () => {
    const none = critical(FLASHING_STRIKE, build('Sword', null), 'Anatomy_Undead').critical;
    expect(none).toMatchObject({ status: 'no-critical-system', chance: { value: null }, multiplier: { value: null } });
    expect(critical(FAN_OF_BLADES, build('Knife', null), 'Anatomy_Undead', { Anatomy_Undead: 48 }).critical.status).toBe('unavailable');
    expect(critical(RESTORATIVE, build('Archery', null), 'Anatomy_Undead', { Anatomy_Undead: 48 }).critical.status).toBe('unavailable');
    const fairy = critical(FAIRY_FIRE, build('FairyMagic', null), 'Anatomy_Humans', { Phrenology_Humans: 48 }).critical;
    expect(fairy.chance.value).toBeNull();
    expect(fairy.chance.reason).toMatch(/Mentalism\/Psychology only/u);
    // Missing level: chance unavailable; multiplier remains source-backed.
    const missing = critical(MOCK, build('Psychology', null), 'Anatomy_Humans').critical;
    expect(missing.chance.value).toBeNull();
    expect(missing.hits[0]!.expected).toBeNull();
    expect(missing.hits[0]!.critical).toBe(222.5);
  });

  it('missing multiplier or invalid normal damage produce no fabricated values', () => {
    const result = calculateAbilityDamage(MOCK, aggregateBuildModifiers(build('Psychology', null), data), data);
    const target = applyTargetDummy(result, { count: 1, damageTypes: { Psychic: { resistance: 150 } } });
    const out = calculateCriticalHit(result, target, { creatureType: 'Anatomy_Humans', skillLevel: levels({ Phrenology_Humans: 30 }) }, data);
    expect(out.hits[0]).toMatchObject({ normal: null, critical: null, expected: null });
    expect(out.status).toBe('unavailable');
    const noMultiplier = { ...result, ability: { ...result.ability!, damage: { ...result.ability!.damage, critDamageMod: null } } };
    const missing = calculateCriticalHit(noMultiplier, applyTargetDummy(noMultiplier, { count: 1, damageTypes: {} }),
      { creatureType: 'Anatomy_Humans', skillLevel: levels({ Phrenology_Humans: 30 }) }, data);
    expect(missing.multiplier).toMatchObject({ value: null, confidence: 'unknown' });
    expect(missing.hits[0]).toMatchObject({ critical: null, expected: null });
  });

  it('is deterministic, does not mutate inputs and keeps provisional confidence', () => {
    const result = calculateAbilityDamage(MOCK, aggregateBuildModifiers(psychologyFixture(data.gameDataVersion), data), data);
    const target = applyTargetDummy(result, { count: 1, damageTypes: {} });
    const before = structuredClone({ result, target });
    const inputs = { creatureType: 'Anatomy_Humans', skillLevel: levels({ Phrenology_Humans: 48 }) };
    const a = calculateCriticalHit(result, target, inputs, data);
    const b = calculateCriticalHit(result, target, inputs, data);
    expect(a).toEqual(b);
    expect({ result, target }).toEqual(before);
    expect(a.confidence).not.toBe('validated');
    expect(a.chance.confidence).toBe('partially_validated');
  });

  it('applies the multiplier after Burst falloff and target modifiers, per target and in totals', () => {
    const doc = { ...build('Psychology', null, [equip('Hands', [{ powerId: 'power_4032', tierId: 'id_18' }])]), target: { count: 5, damageTypes: { Psychic: { vulnerability: 20 } } } };
    const { target, critical: out } = critical(MOCK, doc, 'Anatomy_Humans', { Phrenology_Humans: 30 });
    const hit = target.hits[0]!;
    expect(hit.perTarget).toBeCloseTo(178 * 0.5 * 1.2, 10);
    expect(out.hits[0]!.critical).toBeCloseTo(hit.perTarget! * 1.25, 10);
    expect(out.hits[0]!.criticalTotal).toBeCloseTo(hit.total! * 1.25, 10);
    expect(out.hits[0]!.expectedTotal).toBeCloseTo(hit.total! * 0.95 + hit.total! * 1.25 * 0.05, 10);
  });
});

describe('target creature/Elite conditions (curated direct damage)', () => {
  const flashing = (creatureType: string | null) => calculateAbilityDamage(FLASHING_STRIKE,
    aggregateBuildModifiers(build('Sword', null, [equip('Head', [{ powerId: 'power_1253', tierId: 'id_25' }])]), data, { target: { creatureType, elite: null } }), data);

  it('adds Flashing Strike vs undead only against Undead targets', () => {
    const value = (r: ReturnType<typeof flashing>) => r.components.find(c => c.id === 'damage')!.provisionalDamage;
    const undead = flashing('Anatomy_Undead');
    const flat = Number(data.getTreasureTier('power_1253', 'id_25')!.effectDescriptions[0]!.match(/\+(\d+)/u)![1]);
    expect(value(undead)).toBe(23 + flat);
    expect(value(flashing('Anatomy_Humans'))).toBe(23);
    expect(value(flashing(null))).toBe(23);
    expect(flashing(null).components[0]!.decisions.find(d => d.modifier.attributeId === 'BOOST_ABILITY_FLASHINGSTRIKE')).toMatchObject({ status: 'uncertain', reason: 'condition-unevaluated' });
    expect(flashing('Anatomy_Incorporeal').components[0]!.decisions.find(d => d.modifier.attributeId === 'BOOST_ABILITY_FLASHINGSTRIKE')?.status).toBe('uncertain');
  });

  it('applies non-Elite flats only when the target is explicitly non-Elite', () => {
    const doc = build('Sword', null, [equip('Head', [{ powerId: 'power_1203', tierId: 'id_1' }])]);
    const value = (elite: boolean | null) => calculateAbilityDamage(DECAPITATE, aggregateBuildModifiers(doc, data, { target: { creatureType: null, elite } }), data)
      .components.find(c => c.id === 'damage')!.provisionalDamage;
    const flat = Number(data.getTreasureTier('power_1203', 'id_1')!.effectDescriptions[0]!.match(/\+(\d+)/u)![1]);
    expect(value(false)).toBe(100 + flat);
    expect(value(true)).toBe(100);
    expect(value(null)).toBe(100);
  });
});

describe('T0013-F2 curated rules', () => {
  it('match every published v490 tier of their exact power and nothing else', () => {
    for (const rule of CRITICAL_TREASURE_RULES) {
      const power = data.getTreasurePower(rule.powerId)!;
      expect(power.internalName).toBe(rule.internalName);
      for (const tier of power.tiers) for (const text of tier.effectDescriptions) {
        const out = interpretTreasureEffect(rule.powerId, text, data);
        expect(out?.kind, `${rule.powerId}/${tier.id}: ${text}`).toBe('drafts');
        expect(interpretTreasureEffect(rule.powerId, `${text} while stunned`, data)?.kind).toBe('template-mismatch');
      }
    }
  });
});
