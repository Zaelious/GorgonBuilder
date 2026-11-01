import type { NormalizedTreasurePower } from '../normalized/items-treasure';
import type { Runtime } from '../repository/contracts';
import type { GameDataRepository } from '../repository/repository';
import type { EquipmentDefinition } from './equipment';

export type TreasurePower = Runtime<NormalizedTreasurePower>;
export type RelevanceSignal = 'match' | 'different' | 'unknown';
export interface TreasureContext {
  item: EquipmentDefinition | undefined;
  skillIds: readonly string[];
}
export interface TreasureRelevance {
  profile: RelevanceSignal;
  slot: RelevanceSignal;
  skill: RelevanceSignal;
}

export function powerName(power: TreasurePower): string {
  return power.prefix ?? power.suffix ?? power.internalName;
}
export function normalizeTreasureSearch(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[_\s]+/gu, ' ').trim();
}

/** A transient text index derived solely from the loaded repository. */
export function indexTreasurePowers(powers: readonly TreasurePower[]) {
  return powers.map(power => ({ power, text: normalizeTreasureSearch([
    power.id, power.internalName, power.prefix, power.suffix, power.skill.sourceId,
    power.searchText, ...power.tiers.map(tier => [tier.id, tier.minLevel, tier.maxLevel,
      tier.minRarity, tier.skillLevelPrerequisite, tier.searchText, ...tier.effectDescriptions].join(' ')),
  ].join(' ')) }));
}

/** Item EquipSlot → treasure `Slots` value. The only alias is OffHandShield → OffHand: in v490 every one of
 * the 325 powers in the Shield profile (used by OffHandShield items) publishes the OffHand slot. */
export function treasureSlot(itemSlot: string): string {
  return itemSlot === 'OffHandShield' ? 'OffHand' : itemSlot;
}

/** Independent published facts, never an equipment-legality decision. */
export function treasureRelevance(power: TreasurePower, context: TreasureContext, data: GameDataRepository): TreasureRelevance {
  const reference = context.item?.treasureProfile;
  const profile = reference?.status === 'resolved' ? data.getTreasureProfile(reference.profileId) : undefined;
  return {
    profile: profile ? (profile.powers.some(ref => ref.status === 'resolved' && ref.powerId === power.id) ? 'match' : 'different') : 'unknown',
    slot: context.item && power.slots.length ? (power.slots.includes(treasureSlot(context.item.slot)) ? 'match' : 'different') : 'unknown',
    skill: power.skill.status === 'resolved' && power.skill.skillId !== null && data.getSkill(power.skill.skillId) && context.skillIds.length
      ? (context.skillIds.includes(power.skill.skillId) ? 'match' : 'different') : 'unknown',
  };
}

export function browseTreasurePowers(index: ReturnType<typeof indexTreasurePowers>, query: string,
  relevance: ReadonlyMap<string, TreasureRelevance>, mode: 'relevant' | 'all'): TreasurePower[] {
  const text = normalizeTreasureSearch(query);
  return index.filter(entry => entry.text.includes(text)).map(entry => entry.power).sort((a, b) => {
    if (mode === 'relevant') {
      for (const signal of ['profile', 'slot', 'skill'] as const) {
        const difference = Number(relevance.get(b.id)?.[signal] === 'match') - Number(relevance.get(a.id)?.[signal] === 'match');
        if (difference) return difference;
      }
    }
    return powerName(a).localeCompare(powerName(b)) || a.id.localeCompare(b.id);
  });
}
