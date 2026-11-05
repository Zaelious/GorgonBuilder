import type { ImportedCharacterSnapshot } from '../import/contracts';
import { creatureTypes, criticalChanceTable, type CriticalRulesData } from './critical-rules';

/**
 * T0013-F2 critical skill inputs. A CharacterSheet snapshot is a user-provided local snapshot; its exported `Level`
 * already includes `BonusLevels` (customer-verified, see src/features/import/skill-levels.md) and is used unchanged.
 * Unlike the combat skill-level helper, these sub-skills are deliberately non-combat. Missing or unresolved
 * sub-skills are never treated as level 0.
 *
 * Precedence policy (explicit and predictable): a manual level entered for a sub-skill wins; otherwise a valid,
 * uniquely resolved imported level is used; otherwise the level is unavailable. "Use imported" removes the manual
 * entry. Reimporting replaces only the snapshot and never changes manual entries.
 */
export const CRITICAL_SKILL_LEVEL_MIN = 0;
export const CRITICAL_SKILL_LEVEL_MAX = 200;

export type ImportedCriticalSkill =
  | { readonly status: 'resolved'; readonly level: number; readonly bonusLevels: number | null; readonly sourceName: string; readonly exportedAt: string }
  | { readonly status: 'missing' | 'ambiguous' | 'invalid' | 'version-mismatch'; readonly explanation: string };

export interface CriticalSkillLevel {
  readonly skillId: string;
  readonly skillName: string;
  readonly level: number | null;
  /** Which input supplied `level`; null when unavailable. */
  readonly origin: 'manual' | 'imported' | null;
  /** Imported evidence, kept even when a manual level overrides it; null when no snapshot is loaded. */
  readonly imported: ImportedCriticalSkill | null;
  readonly manual: number | null;
  readonly explanation: string;
}

export type ManualCriticalLevels = Readonly<Record<string, number>>;

export function isValidCriticalSkillLevel(level: unknown): level is number {
  return typeof level === 'number' && Number.isSafeInteger(level) && level >= CRITICAL_SKILL_LEVEL_MIN && level <= CRITICAL_SKILL_LEVEL_MAX;
}

/** True for official Anatomy/Phrenology sub-skills that publish critical-chance notes. */
export function isCriticalSkill(skillId: string, data: CriticalRulesData): boolean {
  return criticalChanceTable(skillId, data) !== null;
}

/** Exact resolved import evidence for one critical sub-skill. Null without a snapshot. */
export function importedCriticalSkill(snapshot: ImportedCharacterSnapshot | undefined | null, skillId: string, data: CriticalRulesData): ImportedCriticalSkill | null {
  if (!snapshot) return null;
  if (snapshot.source.resolvedWithGameDataVersion !== data.gameDataVersion) {
    return { status: 'version-mismatch', explanation: `The CharacterSheet was resolved with ${snapshot.source.resolvedWithGameDataVersion ?? 'no'} game data, not ${data.gameDataVersion}.` };
  }
  const matches = snapshot.skills.filter(skill => skill.reference.status === 'resolved' && skill.reference.id === skillId);
  if (matches.length === 0) return { status: 'missing', explanation: 'The imported CharacterSheet has no resolved entry for this sub-skill; it is not assumed to be level 0.' };
  if (matches.length > 1) return { status: 'ambiguous', explanation: 'The imported CharacterSheet has several entries for this sub-skill; none is chosen.' };
  const { level, bonusLevels, reference } = matches[0]!;
  if (!Number.isSafeInteger(level) || level < 0 || (bonusLevels !== null && (!Number.isSafeInteger(bonusLevels) || bonusLevels < 0))) {
    return { status: 'invalid', explanation: 'The imported level is not a non-negative whole number.' };
  }
  // Exported Level already includes BonusLevels; the bonus is retained only as evidence.
  return { status: 'resolved', level, bonusLevels, sourceName: String(reference.sourceId), exportedAt: snapshot.source.exportedAt };
}

export function resolveCriticalSkillLevel(skillId: string, inputs: { readonly snapshot?: ImportedCharacterSnapshot | null; readonly manualLevels: ManualCriticalLevels },
  data: CriticalRulesData): CriticalSkillLevel {
  const skillName = data.getSkill(skillId)?.name ?? skillId;
  const imported = importedCriticalSkill(inputs.snapshot, skillId, data);
  const manualValue = Object.hasOwn(inputs.manualLevels, skillId) ? inputs.manualLevels[skillId] : undefined;
  const manual = isValidCriticalSkillLevel(manualValue) ? manualValue : null;
  const base = { skillId, skillName, imported, manual };
  if (manual !== null) return { ...base, level: manual, origin: 'manual', explanation: `Manual level ${manual}${imported?.status === 'resolved' ? ` (imported ${imported.level} available)` : ''}.` };
  if (imported?.status === 'resolved') return { ...base, level: imported.level, origin: 'imported', explanation: `Imported level ${imported.level} from ${imported.sourceName}.` };
  return { ...base, level: null, origin: null, explanation: imported ? imported.explanation : 'No CharacterSheet is imported and no manual level is entered.' };
}

/** Resolved imported critical sub-skill entries plus import entries that did not resolve to any official skill. */
export function importedCriticalSkillSummary(snapshot: ImportedCharacterSnapshot | undefined | null, data: CriticalRulesData) {
  const ids = new Set(creatureTypes(data).flatMap(type => [type.anatomySkillId, ...(type.phrenologySkillId ? [type.phrenologySkillId] : [])]));
  const resolved = (snapshot?.skills ?? []).filter(skill => skill.reference.status === 'resolved' && skill.reference.id !== null && ids.has(skill.reference.id));
  const unresolved = (snapshot?.skills ?? []).filter(skill => skill.reference.status !== 'resolved').map(skill => String(skill.reference.sourceId));
  return { resolvedCount: resolved.length, unresolvedSourceNames: unresolved };
}

/** Set or clear one manual override; returns the same object when nothing changes. Invalid values are ignored. */
export function setManualCriticalLevel(levels: ManualCriticalLevels, skillId: string, level: number | null): ManualCriticalLevels {
  if (level === null) {
    if (!Object.hasOwn(levels, skillId)) return levels;
    const next = { ...levels };
    delete next[skillId];
    return next;
  }
  if (!isValidCriticalSkillLevel(level) || levels[skillId] === level) return levels;
  return { ...levels, [skillId]: level };
}
