import type { ImportedCharacterSnapshot } from '../../core/import';
import type { GameDataRepository } from '../../data/repository/repository';

/** CharacterSheet Level is base progression; BonusLevels is separate. Add it once.
 * Evidence: pinned Mithril CharacterReportLoader -> CharacterSkill.EffectiveLevel,
 * corroborated by its captured raw=10, bonus=2 / in-game level 12 event.
 * See skill-levels.md for source links and the limits of that evidence.
 * This reads the immutable snapshot, never the already initialized planner level.
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
  // The source loader treats omitted BonusLevels as zero; raw metadata is retained.
  const bonus = bonusLevels ?? 0;
  if (!Number.isSafeInteger(level) || level < 0 || !Number.isSafeInteger(bonus) || bonus < 0) return null;
  const effective = level + bonus;
  return Number.isSafeInteger(effective) ? effective : null;
}
