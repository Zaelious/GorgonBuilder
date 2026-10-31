import type { GameDataRepository } from '../../data/repository/repository';

export type Ability = GameDataRepository['abilities'][number];
export interface AbilityGroup { id: string; name: string; abilities: Ability[] }

/** Join only official UpgradeOf edges inside this skill, including branches/cycles. */
export function groupAbilities(abilities: readonly Ability[]): AbilityGroup[] {
  const byId = new Map(abilities.map(a => [a.id, a]));
  const edges = new Map(abilities.map(a => [a.id, new Set<string>()]));
  for (const ability of abilities) {
    const parent = ability.upgradeOf?.abilityId;
    if (parent && byId.has(parent)) {
      edges.get(ability.id)!.add(parent);
      edges.get(parent)!.add(ability.id);
    }
  }
  const visited = new Set<string>();
  const groups: AbilityGroup[] = [];
  for (const ability of abilities) {
    if (visited.has(ability.id)) continue;
    const members: Ability[] = [];
    const pending = [ability.id];
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      members.push(byId.get(id)!);
      pending.push(...edges.get(id)!);
    }
    members.sort((a, b) => a.level - b.level || a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id));
    const root = members.find(a => !a.upgradeOf?.abilityId || !byId.has(a.upgradeOf.abilityId)) ?? members[0]!;
    groups.push({ id: root.id, name: root.displayName, abilities: members });
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function rankLabel(rank: Ability['rank']): string {
  return rank === null ? 'Rank not published' : `Rank ${rank}`;
}

/** Highest published Level, then lexicographically smallest canonical ID on ties.
 * This is a picker default, not an inferred Rank or skill-level unlock rule. */
export function highestTier(group: AbilityGroup): Ability {
  return [...group.abilities].sort((a, b) => b.level - a.level || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]!;
}
