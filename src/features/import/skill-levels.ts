import type { ImportedCharacterSnapshot } from '../../core/import';
import type { GameDataRepository } from '../../data/repository/repository';

/** Customer-verified CharacterSheet Level already includes BonusLevels.
 * Use it directly; bonus and Prodigy fields remain source metadata only.
 * See skill-levels.md for the correction to the earlier third-party interpretation.
 */
export function importedSkillLevel(
  snapshot: ImportedCharacterSnapshot | undefined,
  skillId: string | null,
  data: GameDataRepository,
): number | null {
  if (!snapshot || !skillId || !data.getSkill(skillId)?.combat ||
    snapshot.source.resolvedWithGameDataVersion !== data.gameDataVersion) return null;
  const matches = snapshot.skills.filter(skill => skill.reference.status === 'resolved' && skill.reference.id === skillId);
  if (matches.length !== 1) return null;
  const { level, bonusLevels } = matches[0]!;
  // Retain numeric validation of the source bonus without adding it to Level.
  const bonus = bonusLevels ?? 0;
  if (!Number.isSafeInteger(level) || level < 0 || !Number.isSafeInteger(bonus) || bonus < 0) return null;
  return level;
}
