// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { createDefaultBuildDocument } from '../build/document';
import { aggregateBuildModifiers } from './aggregate';
import { calculateAbilityDamage } from './ability-damage';
import { COVERAGE_REASONS, DIRECT_MECHANICS, classifyMechanicText, classifyTreasureEffect, requiresActiveSkillForCoverage, type TreasureCoverageRow } from './treasure-coverage';

const rows = JSON.parse(gunzipSync(readFileSync('docs/treasure-coverage/effects.json.gz')).toString()) as TreasureCoverageRow[];
const summary = JSON.parse(readFileSync('docs/treasure-coverage/summary.json', 'utf8')) as {
  directDamage: Record<'combatSkill' | 'generic' | 'all', Record<'t0014' | 'initial' | 'final', { entries: { total: number; full: number; partial: number } }>>;
  legacyReport: { previousDirectRelatedUnmodeled: number };
};

it('the committed inventory contains every official power/tier/effect exactly once with unchanged source text', () => {
  const data = loadPlannerFixture();
  const byKey = new Map(rows.map(r => [`${r.powerId}/${r.tierId}/${r.effectIndex}`, r]));
  expect(rows).toHaveLength(52039);
  expect(byKey.size).toBe(rows.length);
  let count = 0;
  for (const power of data.treasurePowers) for (const tier of power.tiers) tier.effectDescriptions.forEach((description, index) => {
    const row = byKey.get(`${power.id}/${tier.id}/${index}`);
    if (row?.description !== description || row.internalName !== power.internalName) throw Error(`Inventory mismatch ${power.id}/${tier.id}/${index}`);
    count++;
  });
  expect(count).toBe(rows.length);
});

it('every direct entry has a documented reason per snapshot; other mechanics never make an entry partial', () => {
  for (const r of rows) {
    expect(r.direct).toBe((DIRECT_MECHANICS as readonly string[]).includes(r.mechanic));
    for (const snap of [r.t0014, r.initial, r.final]) {
      if (!COVERAGE_REASONS[snap.reason]) throw Error(`Undocumented reason ${snap.reason} for ${r.powerId}/${r.tierId}`);
      if (!r.direct && snap.status !== 'outside-direct') throw Error(`Outside mechanic counted as direct: ${r.powerId}`);
    }
    if (r.final.status === 'partially-calculated' && r.final.reason.startsWith('side-clause:')) {
      expect(r.directSideMechanics.length, `${r.powerId}`).toBeGreaterThan(0);
    }
  }
  // e.g. "+X% damage and taunts +Y": fully calculated for direct damage, taunt kept as an other mechanic.
  const taunt = rows.find(r => r.powerId === 'power_10455' && r.tierId === 'id_9')!;
  expect([taunt.final.status, taunt.otherMechanics]).toEqual(['fully-calculated', ['taunt']]);
});

it('Generic/AnySkill entries are inventoried once, in their own scope, with calculated contributions', () => {
  const any = rows.filter(r => r.skill === 'AnySkill');
  expect(any.every(r => r.association === 'generic')).toBe(true);
  expect(any.some(r => r.attributeId === 'BOOST_FIRE_DIRECT' && r.final.status === 'fully-calculated')).toBe(true);
  expect(any.some(r => r.powerId === 'power_153' && r.final.appliedAbilityIds.length > 0)).toBe(true);
  const d = summary.directDamage;
  expect(d.all.final.entries.total).toBe(d.combatSkill.final.entries.total + d.generic.final.entries.total);
});

it('coverage only grows across snapshots and reproduces the earlier unmodeled direct-related set', () => {
  for (const scope of ['combatSkill', 'generic', 'all'] as const) {
    const s = summary.directDamage[scope];
    expect(s.t0014.entries.total).toBe(s.final.entries.total);
    expect(s.initial.entries.full).toBeGreaterThanOrEqual(s.t0014.entries.full);
    expect(s.final.entries.full).toBeGreaterThanOrEqual(s.initial.entries.full);
  }
  expect(summary.legacyReport.previousDirectRelatedUnmodeled).toBe(5044);
});

it.each([
  ['Your next attack deals +10 damage', 'stateful-combat'],
  ['Your attacks deal +10 damage to Elves', 'conditional-direct'],
  ['Deal 50 damage over 10 seconds', 'dot-indirect'],
  ['You take 10% less damage', 'defense-incoming'],
  ['Damage shield reflects 20 damage', 'reactive'],
  ['Summoned Skeletons deal +10% direct damage', 'pet-summon'],
  ['Acid Arrow deals +30 damage to Armor', 'multi-hit-or-split'],
  ['Lethal Force deals Fire damage instead of Crushing', 'damage-type-conversion'],
  ['Many Cuts hits all enemies within 5 meters', 'aoe-targeting'],
  ['Reuse timer is -2 seconds', 'non-damage'],
] as const)('screens wording families without executing prose: %s', (text, family) => {
  expect(classifyMechanicText(text)).toBe(family);
});

it('keeps the legacy screening reproducible', () => {
  expect(classifyTreasureEffect('{MOD_SKILL_COW}{0.2}', 'MOD_SKILL_COW', 'Cow Base Damage %')).toEqual({ relevant: true, family: 'skill-base' });
  expect(classifyTreasureEffect('{MAX_HEALTH}{5}', 'MAX_HEALTH', 'Max Health')).toEqual({ relevant: false, family: 'non-damage-stat' });
});

it('required-active-skill treasure effects are not called unconditional merely because an attribute is mapped', () => {
  const withSourceCondition = rows.find(row => row.requiredSkillId !== null);
  expect(withSourceCondition).toBeDefined();
  expect(requiresActiveSkillForCoverage(withSourceCondition!)).toBe(true);
  const strictlyUnconditional = rows.find(row => row.requiredSkillId === null &&
    row.final.mappings.length > 0 && row.final.mappings.every(mapping =>
      mapping.conditions.every(condition => condition.kind !== 'requires-active-skill')));
  expect(strictlyUnconditional).toBeDefined();
  expect(requiresActiveSkillForCoverage(strictlyUnconditional!)).toBe(false);
  const synthetic = { requiredSkillId: null, final: { mappings: [
    { conditions: [{ kind: 'requires-active-skill', skillId: 'Druid', status: 'not-met' }] },
  ] } } as unknown as Pick<TreasureCoverageRow, 'requiredSkillId' | 'final'>;
  expect(requiresActiveSkillForCoverage(synthetic)).toBe(true);
});

it('the corrected report only claims unconditional coverage for rows with no active-skill requirement', () => {
  const labels = new Set(['unconditional-flat-percent', 'skill-base']);
  const before = rows.filter(row => labels.has(row.mechanic));
  const conditional = before.filter(requiresActiveSkillForCoverage);
  const unconditional = before.filter(row => !requiresActiveSkillForCoverage(row));
  expect(unconditional.length + conditional.length).toBe(before.length);
  expect(unconditional.every(row => row.requiredSkillId === null)).toBe(true);
  expect(conditional.length).toBeGreaterThan(0);
});

it('required-active-skill entries are reported as conditional calculations, never as missing hits', () => {
  for (const row of rows.filter(r => r.direct)) {
    for (const snap of [row.t0014, row.initial, row.final]) {
      if (snap.requiredSkillsActivated) expect(requiresActiveSkillForCoverage(row), row.powerId).toBe(true);
      if (snap.reason === 'calculated-when-required-skill-active') expect(snap.requiredSkillsActivated?.length, row.powerId).toBeGreaterThan(0);
    }
    if (!requiresActiveSkillForCoverage(row)) expect(row.final.reason).not.toBe('calculated-when-required-skill-active');
  }
  const animal = rows.find(r => r.powerId === 'power_12191' && r.tierId === 'id_1')!;
  expect(animal.requiredSkillId).toBe('AnimalHandling');
  expect([animal.final.status, animal.final.reason, animal.final.requiredSkillsActivated])
    .toEqual(['fully-calculated', 'calculated-when-required-skill-active', ['AnimalHandling']]);
  const conditional = rows.filter(r => r.direct && r.association === 'combat-skill' && requiresActiveSkillForCoverage(r)
    && ['unconditional-flat-percent', 'skill-base'].includes(r.mechanic));
  expect(conditional).toHaveLength(473);
  expect(conditional.every(r => r.final.status === 'fully-calculated')).toBe(true);
});

it('the required-skill comparison table cites the published T0013-F1 figures, which the recomputed mixed subset reproduces', () => {
  const audit = (JSON.parse(readFileSync('docs/treasure-coverage/summary.json', 'utf8')) as {
    requiredActiveSkillAudit: Record<'publishedT0013F1', Record<'combatSkill' | 'generic' | 'all', { entries: number; fullCoverage: string }>>
      & Record<'recomputedMixed' | 'trulyUnconditional' | 'requiredActiveSkill', Record<'combatSkill' | 'generic' | 'all', { entries: { total: number; coverage: string } }>>;
  }).requiredActiveSkillAudit;
  expect(audit.publishedT0013F1.combatSkill).toEqual({ entries: 11012, fullCoverage: '89.48' });
  for (const scope of ['combatSkill', 'generic', 'all'] as const) {
    expect(audit.recomputedMixed[scope].entries.total).toBe(audit.publishedT0013F1[scope].entries);
    expect(audit.recomputedMixed[scope].entries.coverage).toBe(audit.publishedT0013F1[scope].fullCoverage);
    expect(audit.trulyUnconditional[scope].entries.total + audit.requiredActiveSkill[scope].entries.total)
      .toBe(audit.publishedT0013F1[scope].entries);
  }
});

it('the damage engine applies a required-skill treasure effect only when that skill is one of the two active skills', () => {
  const data = loadPlannerFixture();
  const row = rows.find(r => r.powerId === 'power_12191' && r.tierId === 'id_1')!;
  const ability = row.final.appliedAbilityIds.map(id => data.getAbility(id)!).find(a => a.skill.skillId !== 'AnimalHandling')!;
  expect(ability).toBeDefined();
  const other = data.skills.find(s => s.combat && s.id !== 'AnimalHandling' && s.id !== ability.skill.skillId)!;
  const applied = (second: string) => {
    const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
    build.skillSlotA = { skillId: ability.skill.skillId, level: 0 };
    build.skillSlotB = { skillId: second, level: 0 };
    build.equipment = [{ slot: 'Head', item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } },
      candidateMods: [{ powerId: row.powerId, tierId: row.tierId }], sparks: { mode: 'none' } }];
    return calculateAbilityDamage(ability.id, aggregateBuildModifiers(build, data), data).components
      .flatMap(component => component.decisions).some(decision => decision.status === 'applied'
        && decision.modifier.source.kind === 'candidate-mod' && decision.modifier.source.powerId === row.powerId);
  };
  expect(applied('AnimalHandling')).toBe(true);
  expect(applied(other.id)).toBe(false);
});
