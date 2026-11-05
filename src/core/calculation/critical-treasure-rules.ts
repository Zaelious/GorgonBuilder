import type { ModifierCategory, ModifierConfidence, ModifierOperation, ModifierUnit } from './modifiers';
import type { ModifierDataContext } from './registry';
import { CRITICAL_CHANCE_HOOK, CRITICAL_DAMAGE_HOOK } from './registry';
import type { TreasureEffectDraft, TreasureEffectRule, TreasureTargetCondition } from './treasure-effect-rules';

/**
 * T0013-F2 curated exact-power rules (same contract as the T0014 Mock rules): one official power ID **and**
 * InternalName and one complete sentence template per rule, verified against every published v490 tier. Values reuse
 * official attributes through official ability hooks. Anything not covered (next-attack grants, Knife honing crit
 * damage, "sentient", "Pigs", "total damage", drinks) stays an explicit unsupported record.
 */
export const CRITICAL_TREASURE_ASSUMPTIONS = {
  curated: 'Curated exact-power rule (T0013-F2): this published sentence is read with a fixed template tied to its official power ID and InternalName; other wording stays uninterpreted.',
  abilityCritChance: 'Assumed: "<Ability> … Critical Hit Chance +X%" behaves like the official <Ability> Crit Chance Bonus attribute (percentage points added to that ability\'s critical chance).',
  anatomyCritDamage: 'Assumed: "Anatomy Critical Hit Damage +X%" behaves like the official Anatomy-Based Critical Hit Damage % attribute; restricted to Archery abilities, the skill of this honing power.',
  abilityPercent: 'Assumed: "<Ability> Damage +X%" / "deal(s) +X% damage" behaves like the official <Ability> Damage % attribute.',
  abilityFlat: 'Assumed: "<Ability> deals +N damage" behaves like the official <Ability> Damage attribute (flat points).',
  creature: 'Target condition: applies only when the target dummy creature type is the named official Anatomy category; Unknown leaves it unevaluated (not added).',
  undead: 'The published word "undead" is mapped to the official Undead Anatomy category ("doesn\'t cover undead without bodies"); Incorporeal targets remain unevaluated.',
  elite: 'Target condition: applies only when the target dummy Elite flag matches; Unknown leaves it unevaluated (not added).',
} as const;

const ICONS = '(?:<icon=\\d+>)*';
const NUMBER = '(\\d+(?:\\.\\d+)?)';

function draft(data: ModifierDataContext, part: string, attributeId: string, hook: string, category: ModifierCategory, operation: ModifierOperation,
  unit: ModifierUnit, value: number, sourceValue: string, assumptions: readonly string[], extra: { skillId?: string; targetCondition?: TreasureTargetCondition } = {}): TreasureEffectDraft | null {
  const label = data.getAttribute(attributeId)?.label;
  if (!label) return null;
  return {
    part, category, operation, unit, attributeId, attributeLabel: label, value, sourceValue,
    scope: { kind: 'ability-attribute-hook', attributeId, hook, ...(extra.skillId ? { skillId: extra.skillId } : {}) },
    assumptions: [CRITICAL_TREASURE_ASSUMPTIONS.curated, ...assumptions],
    ...(extra.targetCondition ? { targetCondition: extra.targetCondition } : {}),
  };
}

function all(values: readonly (TreasureEffectDraft | null)[]): TreasureEffectDraft[] | null {
  return values.every(value => value !== null) ? values as TreasureEffectDraft[] : null;
}

const percent = (text: string) => Number(text) / 100;
const CONFIDENCE: ModifierConfidence = 'assumed';

export const CRITICAL_TREASURE_RULES: readonly TreasureEffectRule[] = Object.freeze([
  {
    id: 'treasure:BlitzShotBoost', powerId: 'power_10402', internalName: 'BlitzShotBoost', confidence: CONFIDENCE,
    description: '"Blitz Shot Damage +X%[ and Critical Hit Chance +Y%]" → MOD_ABILITY_BLITZSHOT % and ABILITY_CRIT_CHANCE_DELTA_BLITZSHOT',
    pattern: new RegExp(`^${ICONS}Blitz Shot Damage \\+${NUMBER}%(?: and Critical Hit Chance \\+${NUMBER}%)?$`, 'u'),
    interpret(match, data) {
      const damage = match[1]!, chance = match[2];
      return all([
        draft(data, 'damage:BlitzShot', 'MOD_ABILITY_BLITZSHOT', 'AttributesThatModDamage', 'ability-damage-percent', 'percent', 'fraction', percent(damage), `${damage}%`, [CRITICAL_TREASURE_ASSUMPTIONS.abilityPercent]),
        ...(chance === undefined ? [] : [draft(data, 'crit-chance:BlitzShot', 'ABILITY_CRIT_CHANCE_DELTA_BLITZSHOT', CRITICAL_CHANCE_HOOK, 'critical-chance-percent', 'percent', 'fraction',
          percent(chance), `${chance}%`, [CRITICAL_TREASURE_ASSUMPTIONS.abilityCritChance])]),
      ]);
    },
  },
  {
    id: 'treasure:AimedShotBoostCrit', powerId: 'power_10045', internalName: 'AimedShotBoostCrit', confidence: CONFIDENCE,
    description: '"Aimed Shot deals +N damage, has +X% Critical Hit Chance, and also grants …" → BOOST_ABILITY_AIMEDSHOT and ABILITY_CRIT_CHANCE_DELTA_AIMEDSHOT',
    pattern: new RegExp(`^${ICONS}Aimed Shot deals \\+${NUMBER} damage, has \\+${NUMBER}% Critical Hit Chance, and also grants this Critical Hit Chance bonus to your next Archery attack$`, 'u'),
    unmodeled: 'The Critical Hit Chance grant to your next Archery attack is stateful and is not simulated.',
    interpret(match, data) {
      const damage = match[1]!, chance = match[2]!;
      return all([
        draft(data, 'damage:AimedShot', 'BOOST_ABILITY_AIMEDSHOT', 'AttributesThatDeltaDamage', 'ability-damage-flat', 'flat', 'points', Number(damage), damage, [CRITICAL_TREASURE_ASSUMPTIONS.abilityFlat]),
        draft(data, 'crit-chance:AimedShot', 'ABILITY_CRIT_CHANCE_DELTA_AIMEDSHOT', CRITICAL_CHANCE_HOOK, 'critical-chance-percent', 'percent', 'fraction',
          percent(chance), `${chance}%`, [CRITICAL_TREASURE_ASSUMPTIONS.abilityCritChance]),
      ]);
    },
  },
  {
    id: 'treasure:SharpenedBowCritDamage', powerId: 'power_32302', internalName: 'SharpenedBowCritDamage', confidence: CONFIDENCE,
    description: '"Anatomy Critical Hit Damage +X%" → MOD_CRITICAL_HIT_DAMAGE_ANATOMY for Archery abilities',
    pattern: new RegExp(`^${ICONS}Anatomy Critical Hit Damage \\+${NUMBER}%$`, 'u'),
    interpret(match, data) {
      const value = match[1]!;
      return all([draft(data, 'crit-damage:Anatomy', 'MOD_CRITICAL_HIT_DAMAGE_ANATOMY', CRITICAL_DAMAGE_HOOK, 'critical-damage-percent', 'percent', 'fraction',
        percent(value), `${value}%`, [CRITICAL_TREASURE_ASSUMPTIONS.anatomyCritDamage], { skillId: 'Archery' })]);
    },
  },
  {
    id: 'treasure:FlashingStrikeExtraVsUndead', powerId: 'power_1253', internalName: 'FlashingStrikeExtraVsUndead', confidence: CONFIDENCE,
    description: '"Flashing Strike deals +N damage to undead" → BOOST_ABILITY_FLASHINGSTRIKE against Undead targets',
    pattern: new RegExp(`^${ICONS}Flashing Strike deals \\+${NUMBER} damage to undead$`, 'u'),
    interpret(match, data) {
      const value = match[1]!;
      return all([draft(data, 'damage:FlashingStrike:undead', 'BOOST_ABILITY_FLASHINGSTRIKE', 'AttributesThatDeltaDamage', 'ability-damage-flat', 'flat', 'points', Number(value), value,
        [CRITICAL_TREASURE_ASSUMPTIONS.abilityFlat, CRITICAL_TREASURE_ASSUMPTIONS.creature, CRITICAL_TREASURE_ASSUMPTIONS.undead],
        { targetCondition: { kind: 'creature-type', creatureTypeIds: ['Anatomy_Undead'], ambiguousCreatureTypeIds: ['Anatomy_Incorporeal'] } })]);
    },
  },
  {
    id: 'treasure:ManyCutsDebilitatingBlowKillArthropods', powerId: 'power_1024', internalName: 'ManyCutsDebilitatingBlowKillArthropods', confidence: CONFIDENCE,
    description: '"Many Cuts and Debilitating Blow deal +X% damage to Arthropods (…)" → MOD_ABILITY_MANYCUTS / MOD_ABILITY_DEBILITATINGBLOW against Arthropods',
    pattern: new RegExp(`^${ICONS}Many Cuts and Debilitating Blow deal \\+${NUMBER}% damage to Arthropods \\(such as spiders, mantises, and beetles\\)$`, 'u'),
    interpret(match, data) {
      const value = match[1]!;
      const condition: TreasureTargetCondition = { kind: 'creature-type', creatureTypeIds: ['Anatomy_Arthropods'], ambiguousCreatureTypeIds: [] };
      return all(['MANYCUTS', 'DEBILITATINGBLOW'].map(id => draft(data, `damage:${id}:arthropods`, `MOD_ABILITY_${id}`, 'AttributesThatModDamage', 'ability-damage-percent', 'percent', 'fraction',
        percent(value), `${value}%`, [CRITICAL_TREASURE_ASSUMPTIONS.abilityPercent, CRITICAL_TREASURE_ASSUMPTIONS.creature], { targetCondition: condition })));
    },
  },
  {
    id: 'treasure:DecapitateKillNonElites', powerId: 'power_1203', internalName: 'DecapitateKillNonElites', confidence: CONFIDENCE,
    description: '"Decapitate deals +N damage to non-Elite targets" → BOOST_ABILITY_DECAPITATE against non-Elite targets',
    pattern: new RegExp(`^${ICONS}Decapitate deals \\+${NUMBER} damage to non-Elite targets$`, 'u'),
    interpret(match, data) {
      const value = match[1]!;
      return all([draft(data, 'damage:Decapitate:non-elite', 'BOOST_ABILITY_DECAPITATE', 'AttributesThatDeltaDamage', 'ability-damage-flat', 'flat', 'points', Number(value), value,
        [CRITICAL_TREASURE_ASSUMPTIONS.abilityFlat, CRITICAL_TREASURE_ASSUMPTIONS.elite], { targetCondition: { kind: 'elite', elite: false } })]);
    },
  },
  {
    id: 'treasure:BodyslamBoostNonElites', powerId: 'power_3134', internalName: 'BodyslamBoostNonElites', confidence: CONFIDENCE,
    description: '"Bodyslam deals +N damage to non-Elite enemies" → BOOST_ABILITY_BODYSLAM against non-Elite targets',
    pattern: new RegExp(`^${ICONS}Bodyslam deals \\+${NUMBER} damage to non-Elite enemies$`, 'u'),
    interpret(match, data) {
      const value = match[1]!;
      return all([draft(data, 'damage:Bodyslam:non-elite', 'BOOST_ABILITY_BODYSLAM', 'AttributesThatDeltaDamage', 'ability-damage-flat', 'flat', 'points', Number(value), value,
        [CRITICAL_TREASURE_ASSUMPTIONS.abilityFlat, CRITICAL_TREASURE_ASSUMPTIONS.elite], { targetCondition: { kind: 'elite', elite: false } })]);
    },
  },
]);
