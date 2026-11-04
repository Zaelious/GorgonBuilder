// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadPlannerFixture } from '../../test/planner-fixture';
import { createDefaultBuildDocument, type BuildDocument } from '../build/document';
import { aggregateBuildModifiers } from './aggregate';
import { calculateAbilityDamage } from './ability-damage';
import { DIRECT_TREASURE_DEFINITIONS } from './direct-treasure-rules';
import { classifyRemainder, parseProseDamageClause, resolveProseDamage } from './prose-damage-grammar';
import { interpretTreasureEffect } from './treasure-effect-rules';

const data = loadPlannerFixture();
const lastTier = (powerId: string) => data.getTreasurePower(powerId)!.tiers.at(-1)!;
const text = (powerId: string) => lastTier(powerId).effectDescriptions[0]!;
const resolve = (powerId: string) => resolveProseDamage(text(powerId), data.getTreasurePower(powerId)!.skill.skillId, data);

function withCandidates(skillId: string | null, ...mods: readonly { powerId: string; tierId: string }[]): BuildDocument {
  const build = createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion });
  build.skillSlotA = { skillId, level: 0 };
  build.equipment = [{ slot: 'Head', item: { kind: 'manual', instance: { baseItemId: null, existingPowers: [] } },
    candidateMods: mods.map(m => ({ ...m })), sparks: { mode: 'none' } }];
  return build;
}
/** First rank-1-style ability of a skill with exactly one published direct hit component that lists `attributeId`. */
function singleHitAbility(skillId: string, hook: string, attributeId: string) {
  return data.getAbilitiesForSkill(skillId).find(a => (a.pve.attributeHooks[hook] ?? []).includes(attributeId)
    && [a.damage.damage, a.damage.healthSpecificDamage, a.damage.armorSpecificDamage].filter(v => v !== null).length === 1 && (a.damage.damage ?? 0) > 0)!;
}
const hit = (abilityId: string, build: BuildDocument) =>
  calculateAbilityDamage(abilityId, aggregateBuildModifiers(build, data), data).components.find(c => c.id === 'damage')!;

describe('representative resolutions across combat skills and Generic/AnySkill', () => {
  it.each([
    ['power_10201', 'Archery', [['MOD_ABILITY_HEAVYSHOT', 'ability-damage-percent'], ['MOD_ABILITY_HEAVYMULTISHOT', 'ability-damage-percent']], []],
    ['power_5003', 'Staff', [['BOOST_ABILITY_STAFFSMASH', 'ability-damage-flat'], ['BOOST_ABILITY_DOUBLEHIT', 'ability-damage-flat'], ['BOOST_ABILITY_HEEDTHESTICK', 'ability-damage-flat']], []],
    ['power_3007', 'Unarmed', [['BOOST_SKILL_UNARMED', 'skill-damage-flat']], ['range-accuracy']],
    ['power_13011', 'Hammer', [['MOD_ABILITY_ALL_HAMMER', 'ability-damage-percent']], ['rage']],
    ['power_11605', 'Shield', [['BOOST_ABILITY_SHIELDBASH', 'ability-damage-flat']], ['reuse-time']],
    ['power_24092', 'GiantBat', [['BOOST_ABILITY_DRINKBLOOD', 'ability-damage-flat']], []],
    ['power_9004', 'Mentalism', [['BOOST_ABILITY_ELECTRIFY', 'ability-damage-flat']], ['control']],
    ['power_6084', 'Werewolf', [['BOOST_ABILITY_WEREWOLFCLAW', 'ability-damage-flat'], ['BOOST_ABILITY_DOUBLECLAW', 'ability-damage-flat'], ['BOOST_ABILITY_POUNCINGRAKE', 'ability-damage-flat']], []],
    ['power_20008', 'Cow', [['BOOST_ABILITY_COWBASH', 'ability-damage-flat']], ['taunt', 'reuse-time']],
    ['power_15154', 'IceMagic', [['BOOST_ABILITY_ICENOVA', 'ability-damage-flat']], ['reuse-time']],
  ] as const)('%s (%s) resolves to exact official attributes', (powerId, skillId, expected, other) => {
    const result = resolve(powerId);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.drafts.map(d => [d.attributeId, d.category])).toEqual(expected);
    expect(result.drafts.every(d => d.scope.kind === 'skill' ? d.scope.skillId === skillId : 'skillId' in d.scope && d.scope.skillId === skillId)).toBe(true);
    expect([...result.remainder.other]).toEqual(other);
    expect(result.remainder.direct).toEqual([]);
    expect(result.drafts.every(d => d.assumptions.some(a => a.startsWith('Assumed:')))).toBe(true);
  });

  it('AnySkill group clauses resolve to official abilitykeywords attributes without a skill restriction', () => {
    const result = resolve('power_153');
    expect(result.ok && result.drafts.map(d => [d.attributeId, d.scope])).toEqual([['BOOST_ABILITY_COREATTACK',
      { kind: 'ability-attribute-hook', attributeId: 'BOOST_ABILITY_COREATTACK', hook: 'AttributesThatDeltaDamage' }]]);
  });

  it('agrees with all 38 audited exact-sentence definitions', () => {
    for (const def of DIRECT_TREASURE_DEFINITIONS) for (const tier of data.getTreasurePower(def.powerId)!.tiers) {
      const result = resolveProseDamage(tier.effectDescriptions[0]!, def.skillId, data);
      expect(result.ok && result.drafts.map(d => d.attributeId), `${def.powerId}/${tier.id}`).toEqual([...def.attributes]);
    }
  });
});

describe('fails closed', () => {
  it.each([
    ['Your attacks deal +10 damage to Elves', 'AnySkill'],
    ['Decapitate deals +40 damage to non-Elite targets', 'Sword'],
    ['Backstab deals +10% Direct Damage if target is stunned', 'Knife'],
    ['Acid Arrow deals +30 damage to Armor', 'Archery'],
    ['King of the Forest deals Psychic damage, and damage is +20.', 'Deer'],
    ['Ice Spear deals between +5 and +10 extra damage (randomly determined)', 'IceMagic'],
    ['Heavy Shot deals +10% damage and something unknown happens', 'Archery'],
    ['Heavy Shot deals +10% damage', 'Sword'],
    ['Drink Blood deals +78 Fire damage', 'GiantBat'],
    ['Hamstring Throw deals +40 direct health damage', 'Knife'],
    ['Summoned Skeletons deal +10% direct damage', 'Necromancy'],
  ] as const)('%s', (sentence, skillId) => {
    expect(resolveProseDamage(sentence, skillId === 'AnySkill' ? null : skillId, data).ok).toBe(false);
  });

  it('only interprets a sentence this exact power publishes; curated rules keep precedence', () => {
    expect(interpretTreasureEffect('power_4002', text('power_10201'), data)).toBeNull();
    expect(interpretTreasureEffect('power_10201', text('power_10201'), data, undefined, { proseGrammar: false })).toBeNull();
    const grammar = interpretTreasureEffect('power_10201', text('power_10201'), data);
    expect(grammar?.kind === 'drafts' && grammar.rule.id).toBe('prose-grammar:names-damage');
    const curated = interpretTreasureEffect('power_10202', text('power_10202'), data);
    expect(curated?.kind === 'drafts' && curated.rule.id).toBe('treasure:HeavyShotFasterReuse');
  });

  it('classifies side clauses as other mechanics or recognized direct mechanics, never guessing', () => {
    expect(classifyRemainder(' and taunts +200, and reuse timer is -2 seconds')).toMatchObject({ recognized: true, other: ['taunt', 'reuse-time'], direct: [] });
    expect(classifyRemainder(' and makes the target Off-Guard')).toMatchObject({ recognized: true, direct: ['target-debuff'] });
    expect(classifyRemainder(' and is considered a Bardic Blast ability.')).toMatchObject({ recognized: true, direct: ['keyword-grant'] });
    // A trailing conversion is recognized as an unsupported direct mechanic: the clause is calculated, the entry stays partial.
    const conversion = resolveProseDamage('Mindreave deals +20 damage and deals Electricity damage instead of Psychic', 'Mentalism', data);
    expect(conversion.ok && conversion.remainder.direct).toEqual(['damage-type-conversion']);
    expect(classifyRemainder(' to Elite enemies')).toMatchObject({ recognized: false, unrecognized: ' to Elite enemies' });
    expect(parseProseDamageClause('Your next attack deals +10 damage')).toBeNull();
  });
});

describe('calculation: applicability, stacking, removal, imported powers', () => {
  const heavy = singleHitAbility('Archery', 'AttributesThatModDamage', 'MOD_ABILITY_HEAVYSHOT');
  const tier = lastTier('power_10201');
  const percent = 0.1;

  it('a grammar percentage reaches the named ability, is removable, and leaves other abilities unchanged', () => {
    const base = heavy.damage.damage!;
    expect(hit(heavy.id, withCandidates('Archery', { powerId: 'power_10201', tierId: tier.id })).provisionalDamage).toBeCloseTo(base * (1 + percent), 10);
    expect(hit(heavy.id, withCandidates('Archery')).provisionalDamage).toBe(base);
    const other = data.getAbilitiesForSkill('Archery').find(a => a.damage.damage && !(a.pve.attributeHooks.AttributesThatModDamage ?? []).some(id => id.includes('HEAVY')))!;
    const decisions = calculateAbilityDamage(other.id, aggregateBuildModifiers(withCandidates('Archery', { powerId: 'power_10201', tierId: tier.id }), data), data)
      .components.flatMap(c => c.decisions);
    expect(decisions.every(d => d.status === 'excluded')).toBe(true);
  });

  it('stacks additively with a curated rule and a structured attribute on the same ability', () => {
    const base = heavy.damage.damage!;
    const curatedTier = lastTier('power_10202');
    const curatedPercent = Number(/\+(\d+)%/u.exec(curatedTier.effectDescriptions[0]!)![1]) / 100;
    const both = hit(heavy.id, withCandidates('Archery', { powerId: 'power_10201', tierId: tier.id }, { powerId: 'power_10202', tierId: curatedTier.id }));
    expect(both.provisionalDamage).toBeCloseTo(base * (1 + percent + curatedPercent), 10);
    expect(both.steps.filter(s => s.operation === 'add-percent-contribution')).toHaveLength(2);
  });

  it('a skill-associated group bonus stays within its skill; an AnySkill group bonus spans skills', () => {
    const kickTier = lastTier('power_3025');
    const unarmedKick = data.getAbilitiesForSkill('Unarmed').find(a => a.keywords?.includes('Kick') && a.damage.damage && a.damage.armorSpecificDamage === null && a.damage.healthSpecificDamage === null)!;
    const otherKick = data.abilities.find(a => a.skill.skillId !== 'Unarmed' && a.skill.status === 'resolved' && a.keywords?.includes('Kick') && a.damage.damage)!;
    const build = withCandidates('Unarmed', { powerId: 'power_3025', tierId: kickTier.id });
    expect(hit(unarmedKick.id, build).decisions.some(d => d.status === 'applied')).toBe(true);
    expect(hit(otherKick.id, build).decisions.some(d => d.status === 'applied')).toBe(false);

    const coreTier = lastTier('power_153');
    const cores = ['Sword', 'Archery'].map(skillId => data.getAbilitiesForSkill(skillId).find(a => a.keywords?.includes('CoreAttack') && a.damage.damage
      && a.damage.armorSpecificDamage === null && a.damage.healthSpecificDamage === null && !a.conditionalKeywords?.some(k => k.keyword === 'CoreAttack'))!);
    for (const ability of cores) {
      const result = hit(ability.id, withCandidates(ability.skill.skillId, { powerId: 'power_153', tierId: coreTier.id }));
      expect(result.provisionalDamage, ability.id).toBe(ability.damage.damage! + 36);
    }
  });

  it('an imported existing power reads the same grammar mapping as a planned candidate', () => {
    const t = lastTier('power_3007');
    const planned = aggregateBuildModifiers(withCandidates('Unarmed', { powerId: 'power_3007', tierId: t.id }), data).modifiers;
    const existing = withCandidates('Unarmed');
    existing.equipment[0]!.item = { kind: 'manual', instance: { baseItemId: null, existingPowers: [{ powerId: 'power_3007', tierId: t.id }] } };
    const imported = aggregateBuildModifiers(existing, data).modifiers;
    const project = (list: typeof planned) => list.map(m => [m.attributeId, m.category, m.value, m.mappingRuleId]);
    expect(project(imported)).toEqual(project(planned));
    expect(imported[0]!.source.kind).toBe('existing-power');
    expect(aggregateBuildModifiers(existing, data).unsupported.some(u => u.key.endsWith('/remainder') && u.message.includes('range/accuracy'))).toBe(true);
  });
});
