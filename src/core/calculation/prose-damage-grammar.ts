import type { ModifierCategory, ModifierScope } from './modifiers';
import type { ModifierDataContext } from './registry';
import { damageHooksForAbility } from './keyword-damage';
import type { TreasureEffectDraft } from './treasure-effect-rules';

/**
 * T0013-F1 reusable prose grammar for *unconditional* named-ability damage clauses.
 *
 * This is deliberately narrow. A sentence is interpreted only when ALL of the following hold:
 * 1. It starts with one fixed damage-clause form ("<Names> Damage +N[%]", "<Names> deal(s) +N[%] [direct] damage",
 *    "<Names>'s damage is +N[%]").
 * 2. Every named target resolves to official data: an exact ability display name in the power's own official skill, the
 *    power's own skill name ("<Skill> attacks"), or an official static abilitykeywords damage attribute whose label names
 *    the group ("Core Attacks" → "Core Attack Damage").
 * 3. Each target has exactly one official ability-specific damage attribute with the expected DisplayType, listed in the
 *    official damage hook of those abilities (label "<Name> Damage[ %]" or a hook used by no other ability name).
 * 4. Everything after the damage clause is a sequence of recognized clauses. Non-damage clauses (taunt, reuse, cost,
 *    Rage, control, range, accuracy, healing) are retained as "other mechanics"; recognized damage-affecting clauses are
 *    retained as unsupported direct mechanics. Any unrecognized text, condition, conversion, split component or random
 *    range fails closed and the whole sentence stays unsupported.
 */

/** Recognized clauses outside the direct-hit calculator; they never lower direct-damage coverage. */
export type OtherMechanic = 'taunt' | 'reuse-time' | 'power-cost' | 'rage' | 'control' | 'range-accuracy' | 'call-for-help'
  | 'restore-resource' | 'defense' | 'self-buff' | 'critical' | 'reactive' | 'pet' | 'self-damage' | 'dot';
/** Recognized clauses that change direct damage in ways the direct-hit calculator does not model yet (partial support). */
export type DirectSideMechanic = 'keyword-grant' | 'target-debuff' | 'timed-damage-buff' | 'damage-type-conversion' | 'aoe-conversion'
  | 'random-bonus' | 'triggered-damage';

const N = '[+-]?\\d+(?:\\.\\d+)?';
const NAME = "[A-Z][A-Za-z'\\- ]*?";
const SECONDS = '(?:seconds?|secs?)';
/** Clause boundaries; "but"/"and" are tried before a bare comma. */
const SEPARATOR = ',? and |,? but |, |\\. | (?=plus )';
const SIDE_CLAUSES: readonly (readonly [RegExp, OtherMechanic | DirectSideMechanic])[] = ([
  [`taunts? ${N}(?: to all targets)?`, 'taunt'],
  [`generates? no taunt, instead detaunting by ${N}% of the ability's direct damage`, 'taunt'],
  [`(?:its |the ability's |ability's |ability )?reuse (?:timer|time) (?:is )?(?:increased )?${N} ${SECONDS}(?: sooner)?`, 'reuse-time'],
  [`(?:hastens?|shortens) the (?:current )?(?:reuse|reset) (?:timer|time) of ${NAME} (?:by )?${N} ${SECONDS}`, 'reuse-time'],
  [`hastens? your current combat refresh delay by ${N} ${SECONDS}`, 'reuse-time'],
  [`(?:every other casting )?resets the timer on ${NAME} \\(so it can be used again immediately\\)`, 'reuse-time'],
  [`resets the current reuse timers on ${NAME} and ${NAME}`, 'reuse-time'],
  [`power cost (?:is )?${N}`, 'power-cost'],
  [`costs? ${N} power`, 'power-cost'],
  [`reduces? the power cost of your next ${NAME} ability by ${N}`, 'power-cost'],
  [`generates? ${N}%? rage`, 'rage'],
  [`generates? ${N} less rage`, 'rage'],
  ['generates? no rage', 'rage'],
  [`(?:further |instead )?reduces (?:the )?(?:target's )?rage by ${N}`, 'rage'],
  [`(?:removes|depletes) ${N} rage`, 'rage'],
  [`reduces ${N} more rage`, 'rage'],
  [`causes targets to lose an additional ${N} rage`, 'rage'],
  [`raises the target's max rage by ${N}%, preventing them from using their rage attacks as often`, 'rage'],
  ['stuns the target', 'control'],
  [`(?:there's a |has a |${NAME} has a )?${N}% chance (?:to stun the target|(?:the )?target is stunned)`, 'control'],
  ['knocks? (?:the target|the enemy|all targets|them) back(?:wards)?', 'control'],
  ['(?:the )?targets? (?:is|are) knocked back(?:wards)?', 'control'],
  [`slows? target's movement (?:speed )?by ${N}%`, 'control'],
  ['applies moderate concussion status: target is prone to random self-stuns', 'control'],
  [`(?:has |have )?${N} accuracy(?: \\(which cancels out the evasion that certain monsters have\\))?`, 'range-accuracy'],
  [`accuracy ${N}`, 'range-accuracy'],
  [`range (?:is )?(?:increased )?${N} meters(?: \\(but is still a melee attack\\))?`, 'range-accuracy'],
  [`the ability's range is reduced to ${N}m`, 'range-accuracy'],
  ['(?:non-elite )?targets? (?:does|do) not call for help', 'call-for-help'],
  ["(?:does not|doesn't) cause the target to (?:shout|yell) for help", 'call-for-help'],
  [`restores? ${N} (?:health|armor|power)(?: to you)?(?: after a ${N}-second delay)?`, 'restore-resource'],
  [`heals you for ${N} health`, 'restore-resource'],
  [`causes? the target's next rage attack to deal ${N}% damage \\(debuff cannot stack with itself\\)`, 'defense'],
  [`restores ${N} health over ${N} ${SECONDS}`, 'restore-resource'],
  [`restores ${N} health to you after an? ${N}[- ]second delay`, 'restore-resource'],
  [`you recover ${N} health \\(or armor, if health is full\\) over ${N} ${SECONDS}`, 'restore-resource'],
  [`if it kills your target, you recover ${N} health and ${N} armor`, 'restore-resource'],
  [`causes? your next (?:minor heal ability|healing mist) to restore ${N} (?:health|armor)(?: over ${N} ${SECONDS})?`, 'restore-resource'],
  [`causes? target's (?:rage )?attacks to deal ${N}%? damage for ${N} ${SECONDS}`, 'defense'],
  [`if target is elite, reduces their attack damage ${N}% for ${N} ${SECONDS}`, 'defense'],
  [`targets' next attack deals ${N}% damage`, 'defense'],
  [`reduces the damage of the target's next attack by ${N}`, 'defense'],
  [`for ${N} ${SECONDS} all elite attacks deal ${N}% damage to you`, 'defense'],
  [`you take ${N}% damage from elite attacks for ${N} ${SECONDS}`, 'defense'],
  [`you gain elite resistance ${N}% for ${N} ${SECONDS}`, 'defense'],
  [`grants you immunity to direct damage for ${N} ${SECONDS}`, 'defense'],
  [`grants you ${N} mitigation vs [a-z]+ for ${N} ${SECONDS}`, 'defense'],
  [`grants you ${N}% [a-z]+ vulnerability for ${N} ${SECONDS}`, 'defense'],
  [`gives you ${N}% resistance to [a-z]+ damage for ${N} ${SECONDS}`, 'defense'],
  [`conjures a magical field that mitigates ${N}% of all physical damage you take for ${N} (?:minutes?|${SECONDS}) \\(or until ${N} damage is mitigated\\)`, 'defense'],
  [`boosts your (?:melee evasion|accuracy|major healing) ${N}%? for ${N} ${SECONDS}`, 'self-buff'],
  [`gives you ${N} accuracy for ${N} ${SECONDS} \\(accuracy cancels out the evasion that certain monsters have\\)`, 'self-buff'],
  [`grants ${N} accuracy to your next ${NAME} ability`, 'self-buff'],
  [`increases your sprint speed ${N} for ${N} ${SECONDS}`, 'self-buff'],
  [`grants you ${N}% chance to ignore knockback effects for ${N} ${SECONDS}`, 'self-buff'],
  ['roots the target for \\d+ seconds?', 'control'],
  ['the next attack you use stuns its target', 'control'],
  [`if the target is killed, ${NAME} can be used again immediately`, 'reuse-time'],
  [`(?:has ${N}% critical hit chance|critical hit chance ${N}%)`, 'critical'],
  ['also grants this critical hit chance bonus to your next archery attack', 'critical'],
  ['can critically hit based on your anatomy skill levels', 'critical'],
  [`grants? you ${N}% physical damage reflection for ${N} ${SECONDS}`, 'reactive'],
  [`has a ${N}% chance to summon a deer ally for ${N} ${SECONDS}`, 'pet'],
  [`the ability deals ${N} health damage to you`, 'self-damage'],
  ['is considered a bardic blast ability', 'keyword-grant'],
  ['makes the target off-guard', 'target-debuff'],
  [`(?:increases target's|worsens the target's) [a-z]+ vulnerability ${N}% for ${N} ${SECONDS}`, 'target-debuff'],
  [`increases target's vulnerability to future [a-z]+ attacks ${N}% for ${N} ${SECONDS}`, 'target-debuff'],
  [`(?:renders target|causes target to be) ${N}% more vulnerable to [a-z]+ damage for ${N} ${SECONDS}`, 'target-debuff'],
  [`causes targets? to take ${N}% damage from [a-z]+ for ${N} ${SECONDS}`, 'target-debuff'],
  [`causes (?:the )?target to suffer ${N}%? (?:[a-z]+ )?damage (?:from future attacks )?for ${N} ${SECONDS}`, 'target-debuff'],
  [`plus ${N} [a-z]+ damage over ${N} ${SECONDS}`, 'dot'],
  [`if target is not focused on you it deals ${N}% [a-z]+ damage over ${N} ${SECONDS}`, 'dot'],
  [`boosts your indirect [a-z]+ damage ${N}%? for ${N} ${SECONDS}`, 'dot'],
  [`boosts your (?:nice attack|core attack) damage ${N}%? for ${N} ${SECONDS}`, 'timed-damage-buff'],
  [`boosts the damage of nice attacks by ${N}% for ${N} ${SECONDS}`, 'timed-damage-buff'],
  [`raises basic attack damage ${N}% for ${N} ${SECONDS}`, 'timed-damage-buff'],
  [`causes your (?:core attacks|next attack) to deal ${N} damage(?: for ${N} ${SECONDS})?`, 'timed-damage-buff'],
  [`(?:the )?damage type (?:becomes|is changed to) [a-z]+`, 'damage-type-conversion'],
  [`damage type is [a-z]+ instead of [a-z]+`, 'damage-type-conversion'],
  [`deals [a-z]+ damage (?:instead of [a-z]+|\\(instead of [a-z]+\\))`, 'damage-type-conversion'],
  [`(?:its )?damage becomes [a-z]+ instead of [a-z]+`, 'damage-type-conversion'],
  [`${NAME} damage type becomes [a-z]+`, 'damage-type-conversion'],
  [`(?:ability )?hits all enemies within ${N} meters(?: of your target)?`, 'aoe-conversion'],
  [`if target is more than ${N} meters away, [a-z ]+ to hit all enemies within ${N} meters of (?:the )?target`, 'aoe-conversion'],
  [`(?:has a |there's a )?${N}% chance (?:to deal double damage|to deal ${N}% more damage|it deals ${N}% damage)`, 'random-bonus'],
  [`there is a ${N}% chance to deal ${N}% more damage`, 'random-bonus'],
  [`if blood mist causes you to erupt in a fountain of vile blood, that eruption also deals ${N}%? damage`, 'triggered-damage'],
  [`attack range is ${N}`, 'range-accuracy'],
  [`targets also take ${N}% damage from sentient weather phenomena for ${N} ${SECONDS}`, 'target-debuff'],
  ['all targets are stunned', 'control'],
  ['plus it stuns incorporeal enemies', 'control'],
] as const).map(([source, kind]) => [new RegExp(`^${source}(?=$|${SEPARATOR})`, 'iu'), kind] as const);

const OTHER: ReadonlySet<string> = new Set<OtherMechanic>(['taunt', 'reuse-time', 'power-cost', 'rage', 'control', 'range-accuracy',
  'call-for-help', 'restore-resource', 'defense', 'self-buff', 'critical', 'reactive', 'pet', 'self-damage', 'dot']);

export interface RemainderClassification {
  readonly recognized: boolean;
  readonly other: readonly OtherMechanic[];
  readonly direct: readonly DirectSideMechanic[];
  /** Unrecognized text, if any; the sentence then fails closed. */
  readonly unrecognized: string | null;
}

/** Consumes the text after the damage clause, one recognized clause at a time; never guesses. */
export function classifyRemainder(remainder: string): RemainderClassification {
  const other: OtherMechanic[] = [], direct: DirectSideMechanic[] = [];
  let rest = remainder.trimEnd().replace(/\.$/u, '');
  while (rest.length > 0) {
    const separator = new RegExp(`^(?:${SEPARATOR})`, 'u').exec(rest);
    if (!separator) return { recognized: false, other, direct, unrecognized: rest };
    rest = rest.slice(separator[0].length);
    const clause = SIDE_CLAUSES.find(([pattern]) => pattern.test(rest));
    if (!clause) return { recognized: false, other, direct, unrecognized: rest };
    const kind = clause[1];
    if (OTHER.has(kind)) other.push(kind as OtherMechanic); else direct.push(kind as DirectSideMechanic);
    rest = rest.replace(clause[0], '').replace(/^\.$/u, '');
  }
  return { recognized: true, other: [...new Set(other)], direct: [...new Set(direct)], unrecognized: null };
}

export interface ProseDamageClause {
  readonly form: 'names-damage' | 'names-deal' | 'names-damage-is' | 'names-side-then-damage';
  readonly subject: string;
  readonly sourceValue: string;
  readonly value: number;
  readonly percent: boolean;
  /** Text after the damage clause (or the leading side clause, prefixed with " and "). */
  readonly remainder: string;
  /** "deals +N Piercing damage": the stated type must equal every named ability's published damage type. */
  readonly damageType: string | null;
}

const ICONS = /^(?:<icon=\d+>)+/u;
const VALUE = '\\+(?<n>\\d+(?:\\.\\d+)?)(?<pct>%)?';
const SUBJECT = "(?<subject>[A-Z][^+%\\d]*?)";
const FORMS: readonly (readonly [ProseDamageClause['form'], RegExp])[] = ([
  ['names-damage-is', `^${SUBJECT}(?:'s)? (?:direct )?damage is ${VALUE}(?<rest>.*)$`],
  ['names-damage', `^${SUBJECT} (?:direct )?[Dd]amage ${VALUE}(?<rest>.*)$`],
  ['names-deal', `^${SUBJECT} deals? ${VALUE} (?:[Dd]irect )?(?:(?<type>[A-Z][a-z]+) )?[Dd]amage(?<rest>.*)$`],
  // "<Names> <recognized side clause> and deal(s) +N damage" (e.g. "Electrify stuns the target and deals +N damage").
  ['names-side-then-damage', `^${SUBJECT} (?<side>[a-z][^.]*?) and (?:deals? ${VALUE} damage|damage is ${VALUE.replace('<n>', '<n2>').replace('<pct>', '<pct2>')})$`],
] as const).map(([form, source]) => [form, new RegExp(source, 'u')] as const);

/** Recognizes the leading unconditional damage clause only; resolution and remainder checks happen separately. */
export function parseProseDamageClause(description: string): ProseDamageClause | null {
  const text = description.replace(ICONS, '').trim();
  for (const [form, pattern] of FORMS) {
    const match = pattern.exec(text);
    if (!match?.groups) continue;
    const groups = match.groups as Partial<Record<'subject' | 'n' | 'pct' | 'n2' | 'pct2' | 'rest' | 'type' | 'side', string>>;
    const subject = groups.subject!, n = groups.n ?? groups.n2!, pct = groups.pct ?? groups.pct2;
    // The subject must be names only: no verbs or clauses ("deals", "causes", "boosts", "Your ...").
    if (/\b(?:deals?|causes?|boosts?|costs?|if|when|after|while|against)\b/u.test(subject)) continue;
    // Names are Title Case; only connector words and the group nouns "attacks"/"abilities" may be lowercase.
    if (!subject.split(/[ ,]+/u).filter(Boolean).every(word => /^[A-Z0-9'][\w'-]*$/u.test(word) || /^(?:of|the|and|at|a|to|attacks|abilities)$/u.test(word))) continue;
    const remainder = form === 'names-side-then-damage' ? ` and ${groups.side!}` : groups.rest!;
    return { form, subject: subject.trim(), sourceValue: n, value: Number(n), percent: pct === '%', remainder, damageType: groups.type ?? null };
  }
  return null;
}

export type ProseResolutionFailure =
  | 'no-damage-clause' | 'unrecognized-remainder' | 'unresolved-name' | 'no-damage-attribute' | 'ambiguous-damage-attribute'
  | 'damage-type-mismatch';

export interface ProseDamageResolution {
  readonly ok: true;
  readonly clause: ProseDamageClause;
  readonly remainder: RemainderClassification;
  readonly drafts: readonly TreasureEffectDraft[];
}
export interface ProseDamageFailure {
  readonly ok: false;
  readonly reason: ProseResolutionFailure;
  readonly clause: ProseDamageClause | null;
  readonly remainder: RemainderClassification | null;
  readonly detail: string;
}

export const PROSE_GRAMMAR_ASSUMPTIONS = {
  grammar: 'Reusable T0013-F1 prose grammar: an unconditional leading damage clause was resolved against official ability names, skills or abilitykeywords and official attribute records. Any condition or unrecognized wording fails closed.',
  ability: 'Assumed: "<Ability> deal(s) +X[%] damage" behaves like the official <Ability> damage attribute in that ability\'s published damage hook, with the existing additive flat/percentage stages. Not validated in game.',
  skill: 'Assumed: "<Skill> attacks deal +X[%] damage" behaves like the official <Skill> Damage[ %] attribute published in that skill\'s ability hooks. Not validated in game.',
  exclusiveHook: 'The attribute label does not repeat the ability name; it was chosen as the only ability-specific damage hook used exclusively by every rank of the named ability.',
  keyword: 'Assumed: "<Group> deal +X[%] damage" behaves like the official group damage attribute whose label names that group (direct hook or abilitykeywords rule); a skill-associated power is restricted to its own skill. Not validated in game.',
} as const;

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9%]+/gu, ' ').trim();

/** Display name without its trailing rank number, normalized for comparison. */
export function abilityFamilyName(displayName: string | null | undefined): string {
  return normalize((displayName ?? '').replace(/ \d+$/u, ''));
}

function splitNames(subject: string): string[] {
  return subject.split(/,? and |, /u).map(name => name.trim()).filter(Boolean);
}

interface Target {
  readonly kind: 'ability' | 'skill' | 'keyword'; readonly attributeId: string; readonly label: string;
  /** Published hit damage types of the hooked ability family; empty for skill/keyword groups. */
  readonly damageTypes: readonly string[];
  readonly resolution: 'label' | 'exclusive-hook' | 'group';
}

type Abilities = ModifierDataContext['abilities'];

function resolveAbilityName(name: string, skillId: string, skillName: string, abilities: Abilities, percent: boolean,
  data: ModifierDataContext): Target | 'unresolved-name' | 'no-damage-attribute' | 'ambiguous-damage-attribute' {
  // "Cow's Front Kick" / "Werewolf Bite": a leading skill name or ID qualifies the ability; it is not part of its name.
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const plain = name.replace(new RegExp(`^(?:${escape(skillName)}|${escape(skillId)})(?:'s)? `, 'u'), '');
  const wanted = new Set([normalize(name), normalize(plain)]);
  // Official display names carry a trailing rank number ("Tsunami 3"); the family is every rank of that name.
  const family = abilities.filter(a => a.skill.skillId === skillId && wanted.has(abilityFamilyName(a.displayName)));
  if (!family.length) return 'unresolved-name';
  const hook = percent ? 'AttributesThatModDamage' : 'AttributesThatDeltaDamage';
  const prefix = percent ? 'MOD_ABILITY_' : 'BOOST_ABILITY_';
  const displayType = percent ? 'AsBuffMod' : 'AsBuffDelta';
  const familyIds = new Set(family.map(a => a.id));
  const candidates = [...new Set(family.flatMap(a => a.pve.attributeHooks[hook] ?? []))].filter(id => id.startsWith(prefix)
    && data.getAttribute(id)?.displayType === displayType);
  const labelled = candidates.filter(id => [...wanted].some(w => normalize(data.getAttribute(id)?.label ?? '') === normalize(`${w} damage${percent ? ' %' : ''}`)));
  // Fallback: the only ability-specific hook used exclusively by this ability family (all ranks, any skill).
  const exclusive = candidates.filter(id => abilities.every(a => familyIds.has(a.id) || !(a.pve.attributeHooks[hook] ?? []).includes(id)));
  const chosen = labelled.length ? labelled : exclusive;
  if (chosen.length === 0) return 'no-damage-attribute';
  if (chosen.length > 1) return 'ambiguous-damage-attribute';
  const attributeId = chosen[0]!;
  return { kind: 'ability', attributeId, label: data.getAttribute(attributeId)!.label ?? attributeId, resolution: labelled.length ? 'label' : 'exclusive-hook',
    damageTypes: [...new Set(family.filter(a => (a.pve.attributeHooks[hook] ?? []).includes(attributeId)).map(a => a.damage.damageType))] };
}

const hookSkills = new WeakMap<object, Map<string, Set<string>>>();

/** Official damage-hook attribute → skills whose abilities reference it directly or through static abilitykeywords rules. */
function damageHookSkills(data: ModifierDataContext): Map<string, Set<string>> {
  const cached = hookSkills.get(data);
  if (cached) return cached;
  const index = new Map<string, Set<string>>();
  for (const ability of data.abilities) {
    const hooks = damageHooksForAbility(ability, data);
    for (const hook of ['AttributesThatDeltaDamage', 'AttributesThatModDamage']) for (const id of hooks[hook] ?? []) {
      const skills = index.get(id) ?? new Set<string>();
      skills.add(ability.skill.skillId ?? '');
      index.set(id, skills);
    }
  }
  hookSkills.set(data, index);
  return index;
}

/**
 * "<Group> attacks", "All <Group> Abilities", "Signature Debuffs": an official attribute whose label names that group
 * ("<Group> Damage", "All <Group> Damage", "<Group> Attack Damage", "All <Group> Abilities Damage"), with the expected
 * DisplayType, referenced by a damage hook of the power's own skill (any skill for AnySkill powers). Unique or nothing.
 */
function resolveGroup(name: string, skillId: string | null, percent: boolean, data: ModifierDataContext): Target | null {
  const group = /^(?:all )?(?<g>.+?) (?:attacks|abilities)$/iu.exec(name)?.groups?.g
    ?? /^(?<g>signature debuff|minor heal)s$/iu.exec(name)?.groups?.g;
  if (!group) return null;
  const suffix = percent ? ' %' : '';
  const labels = new Set([`${group} damage`, `all ${group} damage`, `${group} attack damage`, `all ${group} abilities damage`, `${group} abilities damage`]
    .map(label => normalize(label + suffix)));
  const displayType = percent ? 'AsBuffMod' : 'AsBuffDelta';
  const prefixes = percent ? ['MOD_ABILITY_', 'MOD_SKILL_ALL_'] : ['BOOST_ABILITY_', 'BOOST_SKILL_'];
  const index = damageHookSkills(data);
  const matches = [...index.entries()].filter(([id, skills]) => prefixes.some(prefix => id.startsWith(prefix))
    && (skillId === null || skills.has(skillId))
    && data.getAttribute(id)?.displayType === displayType && labels.has(normalize(data.getAttribute(id)?.label ?? ''))).map(([id]) => id);
  if (matches.length !== 1) return null;
  const attributeId = matches[0]!;
  const skillWide = attributeId.startsWith('BOOST_SKILL_') || attributeId.startsWith('MOD_SKILL_ALL_');
  if (skillWide && (skillId === null || attributeId.slice(attributeId.lastIndexOf('_') + 1) !== skillId.toUpperCase())) return null;
  return { kind: skillWide ? 'skill' : 'keyword', attributeId, label: data.getAttribute(attributeId)?.label ?? attributeId, damageTypes: [], resolution: 'group' };
}

/**
 * Resolve one published sentence for one official power. `skillId` is the power's resolved official skill (null for
 * AnySkill/unknown associations, which may only resolve abilitykeywords groups).
 */
export function resolveProseDamage(description: string, skillId: string | null, data: ModifierDataContext): ProseDamageResolution | ProseDamageFailure {
  const clause = parseProseDamageClause(description);
  if (!clause) return { ok: false, reason: 'no-damage-clause', clause: null, remainder: null, detail: 'No leading unconditional damage clause.' };
  const remainder = classifyRemainder(clause.remainder);
  if (!remainder.recognized) return { ok: false, reason: 'unrecognized-remainder', clause, remainder, detail: `Unrecognized wording: "${remainder.unrecognized}"` };
  const skill = skillId ? data.getSkill(skillId) : undefined;
  const skillName = skill ? skill.name ?? skill.id : null;
  const names = splitNames(clause.subject);
  const targets: Target[] = [];
  for (const name of names) {
    const group = resolveGroup(name, skill ? skill.id : null, clause.percent, data);
    if (group) { targets.push(group); continue; }
    if (!skill || !skillName) return { ok: false, reason: 'unresolved-name', clause, remainder, detail: `"${name}" is not an official group name and the power has no combat skill.` };
    const ability = resolveAbilityName(name, skill.id, skillName, data.abilities, clause.percent, data);
    if (typeof ability === 'string') return { ok: false, reason: ability, clause, remainder, detail: `"${name}" in ${skill.id}: ${ability}.` };
    targets.push(ability);
  }
  // A stated damage type is a restriction, never a conversion: it must equal every named ability's published type.
  if (clause.damageType !== null && !targets.every(t => t.kind === 'ability' && t.damageTypes.length > 0 && t.damageTypes.every(type => type === clause.damageType))) {
    return { ok: false, reason: 'damage-type-mismatch', clause, remainder, detail: `Stated ${clause.damageType} damage is not every named ability's published damage type.` };
  }
  if (new Set(targets.map(t => t.attributeId)).size !== targets.length) {
    return { ok: false, reason: 'ambiguous-damage-attribute', clause, remainder, detail: 'Two names resolve to the same attribute.' };
  }
  const value = clause.value / (clause.percent ? 100 : 1);
  const sourceValue = `${clause.sourceValue}${clause.percent ? '%' : ''}`;
  const drafts = targets.map((target): TreasureEffectDraft => {
    const category: ModifierCategory = target.kind === 'skill'
      ? clause.percent ? 'skill-damage-percent' : 'skill-damage-flat'
      : clause.percent ? 'ability-damage-percent' : 'ability-damage-flat';
    const hook = clause.percent ? 'AttributesThatModDamage' : 'AttributesThatDeltaDamage';
    const scope: ModifierScope = target.kind === 'skill' ? { kind: 'skill', skillId: skill!.id }
      : { kind: 'ability-attribute-hook', attributeId: target.attributeId, hook, ...(skill ? { skillId: skill.id } : {}) };
    return { part: `damage:${target.attributeId}`, category, operation: clause.percent ? 'percent' : 'flat', unit: clause.percent ? 'fraction' : 'points',
      attributeId: target.attributeId, attributeLabel: target.label, scope, value, sourceValue,
      assumptions: [PROSE_GRAMMAR_ASSUMPTIONS.grammar, PROSE_GRAMMAR_ASSUMPTIONS[target.kind],
        ...(target.resolution === 'exclusive-hook' ? [PROSE_GRAMMAR_ASSUMPTIONS.exclusiveHook] : [])] };
  });
  return { ok: true, clause, remainder, drafts };
}
