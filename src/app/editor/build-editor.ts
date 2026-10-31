import type { AbilitySelection, BuildDocument } from '../../core/build/document';
import type { GameDataRepository } from '../../data/repository/repository';

export const COMBAT_BAR_SIZE = 6;
export type Slot = 'A' | 'B';
export type BuildEdit =
  | { type: 'skill'; slot: Slot; skillId: string | null }
  | { type: 'level'; slot: Slot; level: number }
  | { type: 'add'; slot: Slot; abilityId: string }
  | { type: 'replace'; slot: Slot; index: number; abilityId: string }
  | { type: 'remove'; slot: Slot; index: number }
  | { type: 'move'; slot: Slot; index: number; direction: -1 | 1 };

/** Only the addressed slot/bar changes. Incompatible saved entries stay reviewable. */
export function editBuild(build: BuildDocument, edit: BuildEdit, data: GameDataRepository): BuildDocument {
  if (build.gameDataVersion !== data.gameDataVersion) return build;
  const skillKey = edit.slot === 'A' ? 'skillSlotA' : 'skillSlotB';
  const barKey = edit.slot === 'A' ? 'abilityBarA' : 'abilityBarB';
  const skill = build[skillKey];
  if (edit.type === 'skill') {
    if (edit.skillId !== null && !data.getSkill(edit.skillId)?.combat) return build;
    return { ...build, [skillKey]: { ...skill, skillId: edit.skillId } };
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

export function selectionWarnings(selection: AbilitySelection, skillId: string | null, level: number, data: GameDataRepository): string[] {
  const ability = data.getAbility(selection.abilityId);
  if (!ability) return [`Official ability ${selection.abilityId} is unavailable in loaded data.`];
  const warnings: string[] = [];
  if (skillId === null || ability.skill.skillId !== skillId) warnings.push('This ability does not belong to the selected skill. Remove it or restore its skill.');
  if (ability.rank !== selection.rank) warnings.push('Saved rank differs from the published rank. The saved selection has been retained.');
  if (ability.level > level) warnings.push(`Published level ${ability.level} exceeds configured skill level ${level}.`);
  return warnings;
}
