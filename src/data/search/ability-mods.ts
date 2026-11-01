import type { CandidateMod, EquipmentSelection } from '../../core/build/document';
import type { GameDataRepository } from '../repository/repository';

type Ability = GameDataRepository['abilities'][number];
type Tier = NonNullable<ReturnType<GameDataRepository['getTreasureTier']>>;

/**
 * Source-backed links between treasure effects and an ability family (abilities connected by official UpgradeOf):
 * - Attribute templates `{ATTR}{value}` require ATTR in the family's published `AttributesThat*` hooks (union over
 *   every rank: ability, PvE, DoT and special-value levels) AND one of:
 *   a) at most MAX_FAMILIES_PER_ATTRIBUTE families reference ATTR, or
 *   b) ATTR's official attributes.json label names this family as a whole phrase (e.g. MOD_ABILITY_ACIDARROW
 *      "Acid Arrow Damage %"), unless the family name is also an official skill name (e.g. First Aid).
 *   (b) is needed because internal treasure-proc abilities (InternalAbility, e.g. TSysBonusAcidCloud1–12) also
 *   reference ability attributes and inflate the family count. Skill-wide/global attributes (MOD_SKILL_DRUID,
 *   ABILITY_RESETTIME_DELTA, "Crossbow Damage", "All Shield Bash Abilities…") are not attributed to one ability.
 * - Prose effects match a family when the text has an official `<icon=N>` used by the family AND names the family as
 *   a whole phrase (case-insensitive; apostrophes ignored). Only when no family matches that way, a description that
 *   *begins* with exactly one family's name (e.g. "Acid Arrow deals…", published with Poison Arrow's icon) matches it.
 * Nothing else is inferred: no damage math, legality or stacking.
 */
export const MAX_FAMILIES_PER_ATTRIBUTE = 3;

export type AbilityModMatch = 'attribute' | 'prose';

export interface AbilityModIndex {
  familyOf(ability: Ability): string;
  familyName(family: string): string;
  familyIcons(family: string): ReadonlySet<number>;
  familyHooks(family: string): ReadonlySet<string>;
  attributeFamilies(attribute: string): number;
  /** Families an attribute is explicitly scoped to by its official label (see rule b). */
  labelledFamilies(attribute: string): ReadonlySet<string>;
  /** Families a prose description references (icon + name, else unique leading name). */
  proseFamilies(description: string): ReadonlySet<string>;
}

function hooksOf(ability: Ability): Set<string> {
  const out = new Set<string>();
  const add = (hooks: Readonly<Record<string, readonly string[]>> | undefined) => {
    for (const list of Object.values(hooks ?? {})) for (const id of list) out.add(id);
  };
  add(ability.attributeHooks);
  add(ability.pve.attributeHooks);
  for (const dot of ability.pve.dots ?? []) add(dot.attributeHooks);
  for (const value of ability.pve.specialValues ?? []) add(value.attributeHooks);
  return out;
}

const normalizeName = (text: string) => text.replace(/['’]/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const phrase = (name: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, 'u');
const add = <K, V>(map: Map<K, Set<V>>, key: K, value: V) => { (map.get(key) ?? map.set(key, new Set()).get(key)!).add(value); };
const EMPTY: ReadonlySet<never> = new Set();

/** Built once per repository; never rescans all powers on hover. */
export function buildAbilityModIndex(data: GameDataRepository): AbilityModIndex {
  const root = new Map<string, string>();
  function familyOf(ability: Ability): string {
    const known = root.get(ability.id);
    if (known) return known;
    let current = ability;
    const seen = new Set<string>([current.id]);
    while (current.upgradeOf?.status === 'resolved' && current.upgradeOf.abilityId) {
      const next = data.getAbility(current.upgradeOf.abilityId);
      if (!next || seen.has(next.id)) break;
      seen.add(next.id); current = next;
    }
    root.set(ability.id, current.id);
    return current.id;
  }
  const icons = new Map<string, Set<number>>();
  const iconFamilies = new Map<number, Set<string>>();
  const hooks = new Map<string, Set<string>>();
  const attributeFamilies = new Map<string, Set<string>>();
  for (const ability of data.abilities) {
    const family = familyOf(ability);
    if (ability.iconId !== null) { add(icons, family, ability.iconId); add(iconFamilies, ability.iconId, family); }
    for (const attribute of hooksOf(ability)) { add(hooks, family, attribute); add(attributeFamilies, attribute, family); }
  }
  const names = new Map<string, string>();
  for (const family of hooks.keys()) names.set(family, normalizeName(data.getAbility(family)?.displayName ?? ''));
  for (const family of icons.keys()) if (!names.has(family)) names.set(family, normalizeName(data.getAbility(family)?.displayName ?? ''));
  const skillNames = new Set(data.skills.map(skill => normalizeName(skill.name ?? skill.id)));
  const familyName = (family: string) => data.getAbility(family)?.displayName ?? family;

  const labelled = new Map<string, ReadonlySet<string>>();
  function labelledFamilies(attribute: string): ReadonlySet<string> {
    const cached = labelled.get(attribute);
    if (cached) return cached;
    const label = normalizeName((data.getAttribute(attribute)?.label ?? '').replace(/\s*%$/u, ''));
    const result = new Set<string>();
    if (label) for (const family of attributeFamilies.get(attribute) ?? []) {
      const name = names.get(family) ?? '';
      if (name && !skillNames.has(name) && phrase(name).test(label)) result.add(family);
    }
    labelled.set(attribute, result);
    return result;
  }

  const prose = new Map<string, ReadonlySet<string>>();
  function proseFamilies(description: string): ReadonlySet<string> {
    const cached = prose.get(description);
    if (cached) return cached;
    const iconIds = [...description.matchAll(/<icon=(\d+)>/gu)].map(match => Number(match[1]));
    const result = new Set<string>();
    if (iconIds.length > 0) {
      const text = normalizeName(description.replace(/<icon=\d+>/gu, ' '));
      for (const id of iconIds) for (const family of iconFamilies.get(id) ?? []) {
        const name = names.get(family) ?? '';
        if (name && phrase(name).test(text)) result.add(family);
      }
      if (result.size === 0) {
        // Narrow fallback: the effect's subject is exactly one family's full name.
        let best = 0; let leading: string[] = [];
        for (const [family, name] of names) {
          if (!name || name.length < best || !text.startsWith(name) || /[\p{L}\p{N}]/u.test(text.charAt(name.length))) continue;
          if (name.length > best) { best = name.length; leading = []; }
          leading.push(family);
        }
        const distinct = new Set(leading.map(family => names.get(family)));
        if (leading.length === 1 && distinct.size === 1) result.add(leading[0]!);
      }
    }
    prose.set(description, result);
    return result;
  }

  return {
    familyOf,
    familyName,
    familyIcons: family => icons.get(family) ?? EMPTY,
    familyHooks: family => hooks.get(family) ?? EMPTY,
    attributeFamilies: attribute => attributeFamilies.get(attribute)?.size ?? 0,
    labelledFamilies,
    proseFamilies,
  };
}

export function matchAbilityEffect(ability: Ability, description: string, index: AbilityModIndex): AbilityModMatch | null {
  const family = index.familyOf(ability);
  const template = /^\{([A-Z_0-9]+)\}\{[^{}]*\}(?:\{[^{}]*\})?$/u.exec(description);
  if (template) {
    const attribute = template[1]!;
    if (!index.familyHooks(family).has(attribute)) return null;
    const families = index.attributeFamilies(attribute);
    return (families > 0 && families <= MAX_FAMILIES_PER_ATTRIBUTE) || index.labelledFamilies(attribute).has(family) ? 'attribute' : null;
  }
  return index.proseFamilies(description).has(family) ? 'prose' : null;
}

export interface RelevantMod {
  equipmentIndex: number;
  slot: string;
  source: 'imported' | 'planned';
  /** Index within existingPowers or candidateMods of that equipment entry. */
  index: number;
  mod: CandidateMod;
  tier: Tier;
  match: AbilityModMatch;
}

/**
 * Equipped treasure powers whose exact official tier resolves and has a source-backed link to the ability family.
 * Stable order: equipment order, then imported powers, then planned candidates. Identical effects on different
 * items (or repeated entries) stay separate. Unresolved saved IDs are skipped, never removed.
 */
export function relevantEquippedMods(ability: Ability, equipment: readonly EquipmentSelection[], data: GameDataRepository,
  index: AbilityModIndex): RelevantMod[] {
  const out: RelevantMod[] = [];
  equipment.forEach((selection, equipmentIndex) => {
    const sources: ['imported' | 'planned', readonly CandidateMod[]][] = [
      ['imported', selection.item.kind === 'database' ? [] : selection.item.instance.existingPowers],
      ['planned', selection.candidateMods]];
    for (const [source, mods] of sources) mods.forEach((mod, modIndex) => {
      const tier = mod.tierId === null ? undefined : data.getTreasureTier(mod.powerId, mod.tierId);
      if (!tier) return;
      const matches = tier.effectDescriptions.map(description => matchAbilityEffect(ability, description, index));
      const match = matches.find(value => value !== null);
      if (match) out.push({ equipmentIndex, slot: selection.slot, source, index: modIndex, mod, tier, match });
    });
  });
  return out;
}

const indexes = new WeakMap<GameDataRepository, AbilityModIndex>();
/** One cached index per loaded repository. */
export function abilityModIndexFor(data: GameDataRepository): AbilityModIndex {
  let index = indexes.get(data);
  if (!index) { index = buildAbilityModIndex(data); indexes.set(data, index); }
  return index;
}
