import type { CandidateMod, EquipmentSelection } from './document';
import type { GameDataRepository } from '../../data/repository/repository';

export type CandidateModEdit = { equipmentIndex: number } & (
  /** unique: normal UI adds never stage a power already present (legacy duplicates are kept as saved). */
  | { type: 'mod-add'; powerId: string; tierId: string | null; unique?: boolean }
  | { type: 'mod-tier'; index: number; tierId: string | null }
  | { type: 'mod-remove'; index: number }
  | { type: 'mod-move'; index: number; direction: -1 | 1 }
);

/** Validate new official selections, retaining unresolved saved candidates on other edits. */
export function editCandidateMods(mods: CandidateMod[], edit: CandidateModEdit, data: GameDataRepository): CandidateMod[] {
  if (edit.type === 'mod-add') {
    if (!data.getTreasurePower(edit.powerId) ||
      (edit.tierId !== null && !data.getTreasureTier(edit.powerId, edit.tierId))) return mods;
    if (edit.unique && mods.some(mod => mod.powerId === edit.powerId)) return mods;
    return [...mods, { powerId: edit.powerId, tierId: edit.tierId }];
  }
  if (!Number.isInteger(edit.index) || !mods[edit.index]) return mods;
  const next = [...mods];
  if (edit.type === 'mod-tier') {
    const mod = mods[edit.index]!;
    if (edit.tierId === mod.tierId || (edit.tierId !== null && !data.getTreasureTier(mod.powerId, edit.tierId))) return mods;
    next[edit.index] = { ...mod, tierId: edit.tierId };
  } else if (edit.type === 'mod-remove') next.splice(edit.index, 1);
  else {
    if (edit.direction !== -1 && edit.direction !== 1) return mods;
    const to = edit.index + edit.direction;
    if (to < 0 || to >= mods.length) return mods;
    [next[edit.index], next[to]] = [next[to]!, next[edit.index]!];
  }
  return next;
}

/** True only for an officially resolved association with exactly this skill (never display text). */
export function candidateBelongsToSkill(mod: CandidateMod, skillId: string, data: GameDataRepository): boolean {
  const power = data.getTreasurePower(mod.powerId);
  return power?.skill.status === 'resolved' && power.skill.skillId === skillId;
}

/** Remove staged candidates resolved to a departed skill. Untouched selections keep their identity. */
export function pruneCandidateModsForSkill(equipment: EquipmentSelection[], skillId: string, data: GameDataRepository): EquipmentSelection[] {
  let changed = false;
  const next = equipment.map(selection => {
    const candidateMods = selection.candidateMods.filter(mod => !candidateBelongsToSkill(mod, skillId, data));
    if (candidateMods.length === selection.candidateMods.length) return selection;
    changed = true;
    return { ...selection, candidateMods };
  });
  return changed ? next : equipment;
}
