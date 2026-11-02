import type { ImportReferenceResolver, ImportedCharacterSnapshot, ImportedReference, ImportResult } from './contracts';
import { array, fail, numberField, object, parseInput, parseText, pointer, reference, reportMetadata, warning } from './validation';

export function parseCharacterSheet(input: unknown, resolver?: ImportReferenceResolver): ImportResult<ImportedCharacterSnapshot> {
  return parseInput(input, (row, warnings) => {
    const source = reportMetadata(row, 'CharacterSheet', resolver, warnings);
    const skillRows = object(row.Skills, '/Skills');
    const knownAbilities: ImportedReference[] = [];
    const skills = Object.entries(skillRows).map(([sourceId, entry]) => {
      const path = pointer('/Skills', sourceId);
      if (!sourceId.trim()) fail('malformed-entry', path, 'Expected a nonempty skill identifier.');
      const raw = object(entry, path);
      const abilities = Object.hasOwn(raw, 'Abilities') ? array(raw.Abilities, `${path}/Abilities`).map((id, index) => {
        // Ability identifiers in the supported report structure are strings.
        if (typeof id !== 'string' || !id.trim()) {
          return fail('invalid-field-type', pointer(`${path}/Abilities`, index), 'Expected a nonempty ability identifier string.');
        }
        return reference(id, resolver?.ability, pointer(`${path}/Abilities`, index), warnings);
      }) : [];
      knownAbilities.push(...abilities);
      return {
        reference: reference(sourceId, resolver?.skill, path, warnings),
        level: numberField(raw, 'Level', path, true, true)!,
        bonusLevels: numberField(raw, 'BonusLevels', path, false, true),
        xpTowardNextLevel: numberField(raw, 'XpTowardNextLevel', path),
        xpNeededForNextLevel: numberField(raw, 'XpNeededForNextLevel', path),
        abilities, metadata: raw,
      };
    });
    const currentStats = object(row.CurrentStats, '/CurrentStats');
    for (const [key, value] of Object.entries(currentStats)) {
      if (typeof value !== 'number') warning(warnings, 'uninterpreted-stat', pointer('/CurrentStats', key), 'Non-numeric stat retained without interpretation.');
    }
    return { source, skills, knownAbilities, currentStats };
  });
}

export function parseCharacterSheetJson(text: string, resolver?: ImportReferenceResolver): ImportResult<ImportedCharacterSnapshot> {
  return parseText(text, input => parseCharacterSheet(input, resolver));
}
