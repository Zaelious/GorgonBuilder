import { editCandidateMods, pruneCandidateModsForSkill, type CandidateModEdit } from '../../core/build/candidate-mods';
import type { AbilitySelection, BuildDocument } from '../../core/build/document';
import type { GameDataRepository } from '../../data/repository/repository';

export const COMBAT_BAR_SIZE = 6;
export type Slot = 'A' | 'B';
export type BuildEdit =
  | CandidateModEdit
  | { type: 'title'; title: string }
  | { type: 'equipment-equip'; slot: string; itemId: string; index: number | null }
  | { type: 'equipment-clear'; index: number }
  | { type: 'equipment-resolve-offhand'; keepIndex: number }
  | { type: 'skill'; slot: Slot; skillId: string | null }
  | { type: 'level'; slot: Slot; level: number }
  | { type: 'add'; slot: Slot; abilityId: string }
  | { type: 'replace'; slot: Slot; index: number; abilityId: string }
  | { type: 'remove'; slot: Slot; index: number }
  | { type: 'move'; slot: Slot; index: number; direction: -1 | 1 };

/** Two canonical item types share one player loadout position. */
export function isOffhandSlot(slot: string): boolean {
  return slot === 'OffHand' || slot === 'OffHandShield';
}

/** Each committed edit preserves unrelated fields. A skill switch clears its own bar and, atomically, staged
 * candidates resolved to the departed skill once neither slot still uses it. */
export function editBuild(build: BuildDocument, edit: BuildEdit, data: GameDataRepository): BuildDocument {
  if (build.gameDataVersion !== data.gameDataVersion) return build;
  if (edit.type === 'mod-add' || edit.type === 'mod-tier' || edit.type === 'mod-remove' || edit.type === 'mod-move') {
    const selection = build.equipment[edit.equipmentIndex];
    if (!Number.isInteger(edit.equipmentIndex) || !selection) return build;
    const candidateMods = editCandidateMods(selection.candidateMods, edit, data);
    if (candidateMods === selection.candidateMods) return build;
    const equipment = [...build.equipment];
    equipment[edit.equipmentIndex] = { ...selection, candidateMods };
    return { ...build, equipment };
  }
  if (edit.type === 'equipment-resolve-offhand') {
    if (!Number.isInteger(edit.keepIndex) || !isOffhandSlot(build.equipment[edit.keepIndex]?.slot ?? '') ||
      build.equipment.filter(selection => isOffhandSlot(selection.slot)).length <= 1) return build;
    // Only this explicit resolution (or an explicit clear) discards legacy entries.
    return { ...build, equipment: build.equipment.filter((selection, index) => !isOffhandSlot(selection.slot) || index === edit.keepIndex) };
  }
  if (edit.type === 'equipment-clear') {
    if (!Number.isInteger(edit.index) || !build.equipment[edit.index]) return build;
    return { ...build, equipment: build.equipment.filter((_, index) => index !== edit.index) };
  }
  if (edit.type === 'equipment-equip') {
    const item = data.getItem(edit.itemId);
    if (!item || item.slot !== edit.slot) return build;
    const equipment = [...build.equipment];
    const offhand = isOffhandSlot(item.slot);
    // Restored conflicts remain untouched until explicitly resolved. Even a
    // direct edit cannot add or replace an occupant while multiple entries exist.
    if (offhand && equipment.filter(selection => isOffhandSlot(selection.slot)).length > 1) return build;
    if (edit.index === null) {
      // New selections cannot accidentally replace a saved/manual selection.
      if (equipment.some(selection => offhand ? isOffhandSlot(selection.slot) : selection.slot === edit.slot)) return build;
      equipment.push({ slot: item.slot, item: { kind: 'database', itemId: item.id }, candidateMods: [], sparks: { mode: 'none' } });
    } else {
      const previous = equipment[edit.index];
      if (!Number.isInteger(edit.index) || !previous || (offhand ? !isOffhandSlot(previous.slot) : previous.slot !== edit.slot)) return build;
      if (previous.slot === item.slot && previous.item.kind === 'database' && previous.item.itemId === item.id) return build;
      // Replace the definition and canonical slot; staged mods/Sparks survive.
      equipment[edit.index] = { ...previous, slot: item.slot, item: { kind: 'database', itemId: item.id } };
    }
    return { ...build, equipment };
  }
  if (edit.type === 'title') {
    const title = edit.title.trim();
    return title && title !== build.title ? { ...build, title } : build;
  }
  const skillKey = edit.slot === 'A' ? 'skillSlotA' : 'skillSlotB';
  const barKey = edit.slot === 'A' ? 'abilityBarA' : 'abilityBarB';
  const skill = build[skillKey];
  if (edit.type === 'skill') {
    if (edit.skillId !== null && !data.getSkill(edit.skillId)?.combat) return build;
    if (edit.skillId === skill.skillId) return build;
    const other = edit.slot === 'A' ? build.skillSlotB : build.skillSlotA;
    const departed = skill.skillId !== null && skill.skillId !== other.skillId ? skill.skillId : null;
    const equipment = departed === null ? build.equipment : pruneCandidateModsForSkill(build.equipment, departed, data);
    return { ...build, [skillKey]: { ...skill, skillId: edit.skillId }, [barKey]: [], equipment };
  }
  if (edit.type === 'level') {
    if (!Number.isSafeInteger(edit.level) || edit.level < 0) return build;
    return { ...build, [skillKey]: { ...skill, level: edit.level } };
  }
  const bar = [...build[barKey]];
  if (edit.type === 'add' || edit.type === 'replace') {
    const ability = data.getAbility(edit.abilityId);
    if (!ability || skill.skillId === null || ability.skill.skillId !== skill.skillId) return build;
    const selection = { abilityId: ability.id, rank: ability.rank };
    if (edit.type === 'add') {
      if (bar.length >= COMBAT_BAR_SIZE) return build;
      bar.push(selection);
    } else {
      if (!Number.isInteger(edit.index) || edit.index < 0 || edit.index >= bar.length) return build;
      bar[edit.index] = selection;
    }
  } else {
    if (!Number.isInteger(edit.index) || edit.index < 0 || edit.index >= bar.length) return build;
    if (edit.type === 'remove') bar.splice(edit.index, 1);
    else {
      const to = edit.index + edit.direction;
      if (to < 0 || to >= bar.length) return build;
      [bar[edit.index], bar[to]] = [bar[to]!, bar[edit.index]!];
    }
  }
  return { ...build, [barKey]: bar };
}

export function selectionWarnings(selection: AbilitySelection, skillId: string | null, data: GameDataRepository): string[] {
  const ability = data.getAbility(selection.abilityId);
  if (!ability) return [`Official ability ${selection.abilityId} is unavailable in loaded data.`];
  const warnings: string[] = [];
  if (skillId === null || ability.skill.skillId !== skillId) warnings.push('This ability does not belong to the selected skill. Remove it or restore its skill.');
  if (ability.rank !== null && selection.rank !== null && ability.rank !== selection.rank) warnings.push('Saved rank differs from the published rank. The saved selection has been retained.');
  return warnings;
}
