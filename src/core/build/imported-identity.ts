import type { ItemInstance } from './document';
import type { JsonValue } from '../../data/normalized/progression';

/** JSON object order is not identity; original source values and array order are. */
function sameSource(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => sameSource(value, b[index]!));
  }
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameSource(a[key]!, b[key]!));
}

/** Conservative identity within the same Storage snapshot. Working powers are
 * deliberately excluded: F2 edits them while preserving the original source.
 * Without verified cross-report instance IDs, a newer report is not a match. */
export function sameImportedInstance(a: ItemInstance, b: ItemInstance): boolean {
  const left = a.provenance, right = b.provenance;
  if (left?.reference !== 'project-gorgon-storage' || right?.reference !== left.reference) return false;
  if (!left.exportedAt || !Number.isFinite(Date.parse(left.exportedAt)) || left.exportedAt !== right.exportedAt ||
    !left.reportVersion || left.reportVersion !== right.reportVersion) return false;
  const lm = left.metadata, rm = right.metadata;
  if (typeof lm?.characterName !== 'string' || !lm.characterName || lm.characterName !== rm?.characterName || lm.server !== rm?.server ||
    typeof lm.sourcePath !== 'string' || !/^\/Items\/\d+$/.test(lm.sourcePath) || lm.sourcePath !== rm?.sourcePath) return false;
  const original = a.metadata?.sourceItem, other = b.metadata?.sourceItem;
  return a.instanceId === b.instanceId && original !== undefined && other !== undefined &&
    original !== null && typeof original === 'object' && !Array.isArray(original) &&
    Object.hasOwn(original, 'TypeID') && sameSource(original, other);
}
