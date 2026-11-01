import type { NormalizedTreasureTier } from '../normalized/items-treasure';
import type { Runtime } from '../repository/contracts';
import type { GameDataRepository } from '../repository/repository';
import type { TreasurePower, TreasureRelevance } from './treasure';

export type TreasureTier = Runtime<NormalizedTreasureTier>;
export type ModTargetLevel = number | 'max';
export interface ModCategories { generic: boolean; endurance: boolean; shamanic: boolean }
export interface PowerGroup { id: string; label: string; powers: TreasurePower[] }

/** Published level bounds order previews; no effect strength or rarity rank is inferred. */
export function orderTreasureTiers(tiers: readonly TreasureTier[]): TreasureTier[] {
  return [...tiers].sort((a, b) => b.minLevel - a.minLevel || b.maxLevel - a.maxLevel ||
    a.minRarity.localeCompare(b.minRarity) || a.id.localeCompare(b.id, undefined, { numeric: true }));
}
export function previewTreasureTiers(power: TreasurePower, target: ModTargetLevel): TreasureTier[] {
  const tiers = orderTreasureTiers(power.tiers);
  return target === 'max' ? tiers.filter(tier => tier.minLevel === tiers[0]?.minLevel)
    : tiers.filter(tier => tier.minLevel <= target && target <= tier.maxLevel);
}
export function candidateTargetMismatch(power: TreasurePower | undefined, tierId: string | null, target: ModTargetLevel): boolean {
  if (!power || tierId === null || !power.tiers.some(tier => tier.id === tierId)) return false;
  const preview = previewTreasureTiers(power, target);
  return preview[0]?.id !== tierId;
}

/** These are source selectors for browsing, not equipment-eligibility categories.
 * AnySkill is deliberately labelled unknown, not resolved as a universal skill.
 */
export function treasureCategoryLabel(power: TreasurePower, data: GameDataRepository): string {
  if (power.skill.sourceId === 'AnySkill') return 'Generic · AnySkill (association unknown)';
  if (power.skill.status !== 'resolved' || power.skill.skillId === null || !data.getSkill(power.skill.skillId)) return 'Unknown association';
  if (power.skill.skillId === 'ShamanicInfusion') return 'Shamanic Infusions';
  return data.getSkill(power.skill.skillId)?.name ?? power.skill.skillId;
}

/** Browsing category: a resolved skill ID, the AnySkill selector, or 'unknown'. Official associations only. */
export function powerCategoryId(power: TreasurePower, data: GameDataRepository): string {
  if (power.skill.sourceId === 'AnySkill') return 'AnySkill';
  return power.skill.status === 'resolved' && power.skill.skillId !== null && data.getSkill(power.skill.skillId) ? power.skill.skillId : 'unknown';
}

/** Short label for compact STATS chips. */
export function treasureChipLabel(power: TreasurePower | undefined, data: GameDataRepository): string {
  if (!power) return 'Unknown';
  const id = powerCategoryId(power, data);
  if (id === 'AnySkill') return 'Generic';
  if (id === 'unknown') return 'Unknown';
  if (id === 'ShamanicInfusion') return 'Shamanic';
  return data.getSkill(id)?.name ?? id;
}

/**
 * How a power relates to the equipped item, from published data only (never a legality decision):
 * - 'listed': published Slots include the item's slot and, where the item publishes a resolved TSysProfile, that
 *   profile lists the power. Endurance and ShamanicInfusion powers are only members of the Redwall/Brewing/Shamanic
 *   profiles, which no v490 item references, so for them only the slot applies. Unknown signals never exclude.
 * - 'outside-profile': slot-compatible, but the item's profile does not list it. Item profiles are treasure-generation
 *   pools, not proof of ineligibility, so powers of an active combat skill stay discoverable here with a visible
 *   "outside item profile · eligibility unconfirmed" flag (e.g. Druid MainHand powers on a Sword-profile MainHand).
 * - 'other-slot': the published Slots do not include the item's slot (only shown when exploring).
 */
export type ItemFit = 'listed' | 'outside-profile' | 'other-slot';

export function itemFit(power: TreasurePower, relevance: TreasureRelevance, data: GameDataRepository): ItemFit {
  if (relevance.slot === 'different') return 'other-slot';
  const category = powerCategoryId(power, data);
  if (category === 'Endurance' || category === 'ShamanicInfusion') return 'listed';
  return relevance.profile === 'different' ? 'outside-profile' : 'listed';
}

/** Strict normal-list fit (slot + profile). */
export function fitsItem(power: TreasurePower, relevance: TreasureRelevance, data: GameDataRepository): boolean {
  return itemFit(power, relevance, data) === 'listed';
}

const UNKNOWN_RELEVANCE: TreasureRelevance = { profile: 'unknown', slot: 'unknown', skill: 'unknown' };

/**
 * One normal entry per official power: staged powers move to Selected. Without exploration, powers must be 'listed',
 * or 'outside-profile' when they belong to one of the active combat skills, so both selected skills stay discoverable.
 */
export function availableTreasurePowers(powers: readonly TreasurePower[], relevance: ReadonlyMap<string, TreasureRelevance>,
  stagedPowerIds: ReadonlySet<string>, exploreAllSlots: boolean, data: GameDataRepository, activeSkillIds: readonly string[] = []): TreasurePower[] {
  return powers.filter(power => {
    if (stagedPowerIds.has(power.id)) return false;
    if (exploreAllSlots) return true;
    const fit = itemFit(power, relevance.get(power.id) ?? UNKNOWN_RELEVANCE, data);
    return fit === 'listed' || (fit === 'outside-profile' && activeSkillIds.includes(powerCategoryId(power, data)));
  });
}

/** Input order preserves the existing profile/slot relevance ranking within groups. */
export function groupTreasurePowers(powers: readonly TreasurePower[], skillIds: readonly string[], categories: ModCategories,
  allSkills: boolean, data: GameDataRepository): PowerGroup[] {
  const active = [...new Set(skillIds)].filter(id => data.getSkill(id)?.combat);
  if (active.length === 0) return [];
  const groups: PowerGroup[] = active.map(id => ({ id, label: `${data.getSkill(id)?.name ?? id} Mods`, powers: [] }));
  if (categories.generic) groups.push({ id: 'AnySkill', label: 'Generic · AnySkill (association unknown)', powers: [] });
  if (categories.endurance && !active.includes('Endurance')) groups.push({ id: 'Endurance', label: 'Endurance Mods', powers: [] });
  if (categories.shamanic && !active.includes('ShamanicInfusion')) groups.push({ id: 'ShamanicInfusion', label: 'Shamanic Infusions', powers: [] });
  // A separate explicit fallback keeps unresolved source associations discoverable.
  groups.push({ id: 'unknown', label: 'Unknown association', powers: [] });
  const byId = new Map(groups.map(group => [group.id, group]));
  for (const power of powers) {
    const id = powerCategoryId(power, data);
    let group = byId.get(id);
    if (!group && allSkills && !['AnySkill', 'Endurance', 'ShamanicInfusion'].includes(id)) {
      group = { id, label: `${treasureCategoryLabel(power, data)} Mods`, powers: [] };
      byId.set(id, group); groups.push(group);
    }
    group?.powers.push(power);
  }
  return groups.filter(group => group.powers.length > 0);
}

/** Presentation tone for STATS chips, from the official resolved association and the build's current slots. */
export type SkillTone = 'skill-a' | 'skill-b' | 'generic' | 'endurance' | 'shamanic' | 'other' | 'unknown';
const TONE_ORDER: readonly SkillTone[] = ['skill-a', 'skill-b', 'generic', 'endurance', 'shamanic', 'other', 'unknown'];

export function skillTone(power: TreasurePower | undefined, skillA: string | null, skillB: string | null, data: GameDataRepository): SkillTone {
  if (!power) return 'unknown';
  const category = powerCategoryId(power, data);
  // A=B uses the single primary (A) colour.
  if (skillA !== null && category === skillA) return 'skill-a';
  if (skillB !== null && category === skillB) return 'skill-b';
  if (category === 'AnySkill') return 'generic';
  if (category === 'Endurance') return 'endurance';
  if (category === 'ShamanicInfusion') return 'shamanic';
  return category === 'unknown' ? 'unknown' : 'other';
}

/**
 * Presentation-only grouping of planned mods: Skill A, Skill B, Generic, Endurance, Shamanic, other resolved skills
 * (by first appearance), Unknown. Stable within each group; `index` is the original saved candidate index.
 */
export function groupPlannedMods<T extends { powerId: string }>(mods: readonly T[], skillA: string | null, skillB: string | null,
  data: GameDataRepository): { mod: T; index: number; tone: SkillTone }[] {
  const rows = mods.map((mod, index) => {
    const power = data.getTreasurePower(mod.powerId);
    return { mod, index, tone: skillTone(power, skillA, skillB, data), category: power ? powerCategoryId(power, data) : 'unknown' };
  });
  const otherOrder = [...new Set(rows.filter(row => row.tone === 'other').map(row => row.category))];
  const rank = (row: typeof rows[number]) => TONE_ORDER.indexOf(row.tone) * 10000 + (row.tone === 'other' ? otherOrder.indexOf(row.category) : 0);
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.index - b.index).map(({ mod, index, tone }) => ({ mod, index, tone }));
}
