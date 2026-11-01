import type { AbilitySelection, BuildDocument } from '../../core/build/document';
import type { GameDataRepository } from '../../data/repository/repository';

export const COMBAT_BAR_SIZE = 6;
export type Slot = 'A' | 'B';
export type BuildEdit =
  | { type: 'title'; title: string }
  | { type: 'skill'; slot: Slot; skillId: string | null }
  | { type: 'level'; slot: Slot; level: number }
  | { type: 'add'; slot: Slot; abilityId: string }
  | { type: 'replace'; slot: Slot; index: number; abilityId: string }
  | { type: 'remove'; slot: Slot; index: number }
  | { type: 'move'; slot: Slot; index: number; direction: -1 | 1 };

/** Each committed edit preserves unrelated fields. Skill switches clear only their own bar. */
export function editBuild(build: BuildDocument, edit: BuildEdit, data: GameDataRepository): BuildDocument {
  if (build.gameDataVersion !== data.gameDataVersion) return build;
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
    return { ...build, [skillKey]: { ...skill, skillId: edit.skillId }, [barKey]: [] };
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
