import { getUniqueActiveSkillIds, type BuildDocument } from '../../core/build/document';
import type { GameDataRepository } from '../../data/repository/repository';

/** The factory title of a new BuildDocument (see createDefaultBuildDocument). */
export const UNTITLED_BUILD = 'Untitled build';
const TITLE_LIMIT = 120;

/**
 * T0020 default title: official combat-skill names in slot order (`Cow/Unarmed`). Both slots
 * using one skill produce that skill once; one skill gives its name; none gives the factory title.
 */
export function defaultBuildTitle(build: Pick<BuildDocument, 'skillSlotA' | 'skillSlotB'>, data: Pick<GameDataRepository, 'getSkill'>): string {
  const ids = getUniqueActiveSkillIds(build);
  if (!ids.length) return UNTITLED_BUILD;
  return ids.map(id => data.getSkill(id)?.name ?? id).join('/').slice(0, TITLE_LIMIT);
}

/**
 * BuildDocument v1 has no "customized" flag, so a title still follows the skills only while it
 * equals the factory title or the generated name for the current skills. Any other text the
 * user typed is custom and is never replaced by a later skill change.
 */
export function isAutomaticTitle(build: Pick<BuildDocument, 'title' | 'skillSlotA' | 'skillSlotB'>, data: Pick<GameDataRepository, 'getSkill'>): boolean {
  return build.title === UNTITLED_BUILD || build.title === defaultBuildTitle(build, data);
}

/** Applied to skill edits only: refresh an automatic title, keep a custom one unchanged. */
export function followSkillTitle(previous: BuildDocument, next: BuildDocument, data: Pick<GameDataRepository, 'getSkill'>): BuildDocument {
  if (!isAutomaticTitle(previous, data)) return next;
  const title = defaultBuildTitle(next, data);
  return title === next.title ? next : { ...next, title };
}
