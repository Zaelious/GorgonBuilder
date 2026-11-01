import type { CandidateMod, EquipmentSelection } from '../../core/build/document';
import type { GameDataRepository } from '../repository/repository';

type Ability = GameDataRepository['abilities'][number];
type Tier = NonNullable<ReturnType<GameDataRepository['getTreasureTier']>>;

/**
 * Source-backed links between treasure effects and an ability family (abilities connected by official UpgradeOf):
 * - Attribute templates `{ATTR}{value}` match when ATTR appears in the ability's published `AttributesThat*` hooks
 *   (ability, PvE, DoT or special-value level) AND at most MAX_FAMILIES_PER_ATTRIBUTE families reference ATTR.
 *   Attributes referenced by more families (e.g. MOD_SKILL_DRUID: 22, ABILITY_RESETTIME_DELTA: 1,935) are skill-wide
 *   or global, so they are not labelled as specific to one ability.
 * - Prose effects match when they contain an official `<icon=N>` equal to an IconID used by the family AND the
 *   family's root display name appears as a whole phrase (case-insensitive; apostrophes ignored).
 * Nothing else is inferred: no damage math, legality or stacking.
 */
export const MAX_FAMILIES_PER_ATTRIBUTE = 3;

export type AbilityModMatch = 'attribute' | 'prose';

export interface AbilityModIndex {
  familyOf(ability: Ability): string;
  familyName(family: string): string;
  familyIcons(family: string): ReadonlySet<number>;
  attributeFamilies(attribute: string): number;
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

const hookCache = new WeakMap<Ability, Set<string>>();
function cachedHooks(ability: Ability) {
  let hooks = hookCache.get(ability);
  if (!hooks) { hooks = hooksOf(ability); hookCache.set(ability, hooks); }
  return hooks;
}

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
  const attributeFamilies = new Map<string, Set<string>>();
  for (const ability of data.abilities) {
    const family = familyOf(ability);
    if (ability.iconId !== null) (icons.get(family) ?? icons.set(family, new Set()).get(family)!).add(ability.iconId);
    for (const attribute of cachedHooks(ability)) (attributeFamilies.get(attribute) ?? attributeFamilies.set(attribute, new Set()).get(attribute)!).add(family);
  }
  return {
    familyOf,
    familyName: family => data.getAbility(family)?.displayName ?? family,
    familyIcons: family => icons.get(family) ?? new Set(),
    attributeFamilies: attribute => attributeFamilies.get(attribute)?.size ?? 0,
  };
}

const normalizeName = (text: string) => text.replace(/['’]/gu, '').toLowerCase();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

export function matchAbilityEffect(ability: Ability, description: string, index: AbilityModIndex): AbilityModMatch | null {
  const template = /^\{([A-Z_0-9]+)\}\{[^{}]*\}(?:\{[^{}]*\})?$/u.exec(description);
  if (template) {
    const attribute = template[1]!;
    const families = index.attributeFamilies(attribute);
    return cachedHooks(ability).has(attribute) && families > 0 && families <= MAX_FAMILIES_PER_ATTRIBUTE ? 'attribute' : null;
  }
  const iconIds = [...description.matchAll(/<icon=(\d+)>/gu)].map(match => Number(match[1]));
  if (iconIds.length === 0) return null;
  const family = index.familyOf(ability);
  const familyIcons = index.familyIcons(family);
  if (!iconIds.some(id => familyIcons.has(id))) return null;
  const name = normalizeName(index.familyName(family)).trim();
  if (!name) return null;
  const text = normalizeName(description.replace(/<icon=\d+>/gu, ' '));
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, 'u').test(text) ? 'prose' : null;
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
