import type { ModifierDataContext } from './registry';
import type { TreasureEffectDraft, TreasureEffectRule } from './treasure-effect-rules';

/** Exact v490 identities and complete tier templates, never a general English proc parser. */
export const DAMAGE_SCENARIO_ASSUMPTIONS = {
  stacks: 'Estimated: the selected active Continuous Trampling contributions (0–30) multiply each equipped per-contribution bonus; separate equipped copies add. The resulting flat enters the existing damage formula before non-base percentages. Customer tests (Stampede 12, 2 s reuse, 60 s buff) matched about 30 active contributions for +56 and for +50 and +56 together; that is a steady state, not a game stack cap. Other reuse times and expiry timing are not modeled.',
  multiplier: 'Estimated: chance-based double/+X% damage multiplies the final noncritical direct hit, including ordinary bonuses and target stages. No critical/proc interaction, independence of rolls, caps or rounding is established.',
  flat: 'Estimated: chance-based +N damage is a flat addition through the existing direct-hit formula and target stages, only when triggered. Its ordering has not been measured in game.',
  duplicates: 'Multiple applicable proc sources: stacking, shared versus independent rolls and priority are undocumented. Combined probability, proc hit and expected damage are unavailable; individual sources are isolated scenarios only.',
  critical: 'Proc expectations use noncritical hits only. They are separate from critical expectations; no joint critical-plus-proc expectation is calculated.',
} as const;

const ICONS = '(?:<icon=\\d+>)*';
const N = '(\\d+(?:\\.\\d+)?)';

/** Audited adjacent families, recognized for explicit Unavailable results, never guessed into numeric damage. */
export const UNMODELED_DAMAGE_PROCS: readonly { powerId: string; skillId: string; keywords: readonly string[]; reason: string }[] = [
  ...[
    ['power_16062', 'Knife', 'PoisonersCut'], ['power_16102', 'Knife', 'Slice'], ['power_20102', 'Cow', 'ClobberingHoof'],
    ['power_23004', 'Spider', 'SpiderBite', 'InfiniteLegs'], ['power_23022', 'Spider', 'InjectVenom'], ['power_23203', 'Spider', 'Gripjaw'],
    ['power_24032', 'GiantBat', 'Tear'], ['power_24033', 'GiantBat', 'Tear'], ['power_24062', 'GiantBat', 'WingVortex'],
    ['power_24063', 'GiantBat', 'WingVortex'], ['power_24122', 'GiantBat', 'VirulentBite'], ['power_24182', 'GiantBat', 'Screech'],
    ['power_24212', 'GiantBat', 'SonicBurst'], ['power_24282', 'GiantBat', 'Deathscream'],
  ].map(([powerId, skillId, ...keywords]) => ({ powerId: powerId!, skillId: skillId!, keywords,
    reason: 'Audited adjacent proc remains unmodeled: this ticket supports the four historical random-bonus powers and the Cow Front Kick flat proc only.' })),
  { powerId: 'power_20011', skillId: 'Cow', keywords: ['CowFrontKick'], reason: 'Random AoE conversion changes both damage and affected targets; no fixed-target proc is inferred.' },
  { powerId: 'power_22003', skillId: 'Pig', keywords: ['PigBite'], reason: 'Random AoE conversion changes both damage and affected targets.' },
  { powerId: 'power_28064', skillId: 'SpiritFox', keywords: ['SoulBite'], reason: 'Requires active Blur Step and random AoE conversion.' },
  { powerId: 'power_15031', skillId: 'IceMagic', keywords: [], reason: 'Multi-target ability eligibility and per-ability damage component allocation require separate rules.' },
  { powerId: 'power_15032', skillId: 'IceMagic', keywords: [], reason: 'Single-target ability eligibility and per-ability damage component allocation require separate rules.' },
  { powerId: 'power_16002', skillId: 'Knife', keywords: ['KnifeNonCut'], reason: 'Requires a preceding Cut ability and a timed 10-second buff.' },
  { powerId: 'power_16013', skillId: 'Knife', keywords: [], reason: 'Requires a preceding Opening Thrust and a timed 10-second buff.' },
  // Rabbit grants cross-skill Kick damage while Rabbit is active. Its source skill is deliberately not an ability restriction.
  ...['power_25007', 'power_25008'].map(powerId => ({ powerId, skillId: '*', keywords: ['Kick'], reason: 'Cross-skill Rabbit proc and its duplicate interaction require separate active-skill rules.' })),
];

function hooked(data: ModifierDataContext, skillId: string, attributeId: string, hook: string,
  values: Omit<TreasureEffectDraft, 'scope' | 'attributeId' | 'attributeLabel'>): TreasureEffectDraft | null {
  const attributeLabel = data.getAttribute(attributeId)?.label;
  if (!attributeLabel) return null;
  return { ...values, attributeId, attributeLabel, scope: { kind: 'ability-attribute-hook', skillId, attributeId, hook } };
}

interface ProcDefinition {
  powerId: string; internalName: string; skillId: string; attributeId: string; percent?: boolean;
  pattern: RegExp; effect: 'multiply-hit' | 'add-flat';
  /** Captures: unconditional damage (optional), chance, triggered bonus (absent = double). */
  captures: readonly [number | null, number, number | null];
}

const definitions: readonly ProcDefinition[] = [
  { powerId: 'power_4062', internalName: 'StrikeANerveCrit', skillId: 'Psychology', attributeId: 'BOOST_ABILITY_STRIKEANERVE',
    pattern: new RegExp(`^${ICONS}Strike a Nerve deals \\+${N} damage and has a ${N}% chance to deal double damage$`, 'u'),
    effect: 'multiply-hit', captures: [1, 2, null] },
  { powerId: 'power_21023', internalName: 'DeerBashCrit', skillId: 'Deer', attributeId: 'BOOST_ABILITY_DEERBASH',
    pattern: new RegExp(`^${ICONS}Deer Bash deals \\+${N} damage and has a ${N}% chance to deal \\+${N}% more damage$`, 'u'),
    effect: 'multiply-hit', captures: [1, 2, 3] },
  { powerId: 'power_22085', internalName: 'PigRendCrit', skillId: 'Pig', attributeId: 'MOD_ABILITY_PIGREND', percent: true,
    pattern: new RegExp(`^${ICONS}Pig Rend damage \\+${N}% and there is a ${N}% chance to deal \\+${N}% more damage$`, 'u'),
    effect: 'multiply-hit', captures: [1, 2, 3] },
  { powerId: 'power_28124', internalName: 'SpiritBoltCrit', skillId: 'SpiritFox', attributeId: 'BOOST_ABILITY_SPIRITBOLT',
    pattern: new RegExp(`^${ICONS}Spirit Bolt deals \\+${N} damage and there's a ${N}% chance it deals \\+${N}% damage$`, 'u'),
    effect: 'multiply-hit', captures: [1, 2, 3] },
  { powerId: 'power_20003', internalName: 'CowFrontKickCritAdd', skillId: 'Cow', attributeId: 'BOOST_ABILITY_COWFRONTKICK',
    pattern: new RegExp(`^${ICONS}Cow's Front Kick has a ${N}% chance to deal \\+${N} damage$`, 'u'),
    effect: 'add-flat', captures: [null, 1, 2] },
];

export const SCENARIO_TREASURE_RULES: readonly TreasureEffectRule[] = Object.freeze([
  {
    id: 'treasure:CowStampedeStackingAdd', powerId: 'power_20004', internalName: 'CowStampedeStackingAdd',
    // Official text still says "(stacks up to 15 times)"; it is matched unchanged and not treated as the scenario limit (T0015-R1).
    description: 'Continuous Trampling: exact per-contribution Stampede bonus (0–30 manually selected active contributions).',
    pattern: new RegExp(`^${ICONS}Stampede boosts the damage of future Stampede attacks by \\+${N} for 60 seconds \\(stacks up to 15 times\\)$`, 'u'),
    confidence: 'assumed',
    interpret(match, data) {
      const value = match[1]!;
      const draft = hooked(data, 'Cow', 'BOOST_ABILITY_STAMPEDE', 'AttributesThatDeltaDamage', {
        part: 'per-stack', category: 'stampede-damage-per-stack', operation: 'flat', unit: 'points', value: Number(value),
        sourceValue: value, assumptions: [DAMAGE_SCENARIO_ASSUMPTIONS.stacks],
      });
      return draft ? [draft] : null;
    },
  },
  {
    id: 'treasure:CowStampedeVsStunned', powerId: 'power_20020', internalName: 'CowStampedeVsStunned',
    description: 'Stampede percentage damage only while the player is stunned (manual scenario).',
    pattern: /^(?:<icon=\d+>)*Stampede deals \+(\d+(?:\.\d+)?)% damage if used while you are stunned$/u,
    confidence: 'assumed',
    interpret(match, data) {
      const draft = hooked(data, 'Cow', 'MOD_ABILITY_STAMPEDE', 'AttributesThatModDamage', {
        part: 'while-stunned', category: 'stampede-stunned-percent', operation: 'percent', unit: 'fraction',
        value: Number(match[1]) / 100, sourceValue: `${match[1]}%`,
        assumptions: ['Estimated: the equipped Stampede bonus applies only while the player is stunned. Its percentage uses the existing base-plus-flats percentage basis, additive with other non-base percentages; Skill Base remains on original base. In-game ordering is unvalidated.'],
      });
      return draft ? [draft] : null;
    },
  },
  ...definitions.map((definition): TreasureEffectRule => ({
    id: `treasure:${definition.internalName}`, powerId: definition.powerId, internalName: definition.internalName,
    description: 'Independent unconditional direct damage and a source-backed chance-based direct-hit scenario.',
    pattern: definition.pattern, confidence: 'assumed',
    interpret(match, data) {
      const [ordinaryIndex, chanceIndex, bonusIndex] = definition.captures;
      const chance = Number(match[chanceIndex]) / 100;
      if (chance < 0 || chance > 1) return null;
      const hook = definition.percent ? 'AttributesThatModDamage' : 'AttributesThatDeltaDamage';
      const base = ordinaryIndex === null ? null : hooked(data, definition.skillId, definition.attributeId, hook, {
        part: 'ordinary', category: definition.percent ? 'ability-damage-percent' : 'ability-damage-flat',
        operation: definition.percent ? 'percent' : 'flat', unit: definition.percent ? 'fraction' : 'points',
        value: Number(match[ordinaryIndex]) / (definition.percent ? 100 : 1), sourceValue: `${match[ordinaryIndex]}${definition.percent ? '%' : ''}`,
        assumptions: ['Unconditional damage uses the existing official ability attribute hook exactly once, separately from the proc.'],
      });
      const value = bonusIndex === null ? 2 : definition.effect === 'multiply-hit' ? 1 + Number(match[bonusIndex]) / 100 : Number(match[bonusIndex]);
      const proc = hooked(data, definition.skillId, definition.attributeId, hook, {
        part: 'proc', category: 'chance-damage-proc', operation: definition.effect === 'multiply-hit' ? 'multiply' : 'flat',
        unit: definition.effect === 'multiply-hit' ? 'multiplier' : 'points', value, sourceValue: bonusIndex === null ? 'double' : match[bonusIndex]!,
        proc: { probability: chance, effect: definition.effect },
        assumptions: [definition.effect === 'multiply-hit' ? DAMAGE_SCENARIO_ASSUMPTIONS.multiplier : DAMAGE_SCENARIO_ASSUMPTIONS.flat,
          DAMAGE_SCENARIO_ASSUMPTIONS.critical],
      });
      return proc && (ordinaryIndex === null || base) ? [...(base ? [base] : []), proc] : null;
    },
  })),
]);
