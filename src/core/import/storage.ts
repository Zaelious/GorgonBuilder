import type { JsonObject, JsonValue } from '../../data/normalized/progression';
import type {
  EquippedStateCapability, ImportIssue, ImportReferenceResolver, ImportResult,
  ImportedItemInstance, ImportedStorageSnapshot, ImportedTreasurePower,
} from './contracts';
import {
  array, fail, identifier, numberField, object, parseInput, parseText, pointer,
  reference, reportMetadata, textField, warning,
} from './validation';

/** No researched report field establishes equipped state. Names alone are not evidence. */
export function detectEquippedStateCapability(): EquippedStateCapability {
  return { status: 'unavailable', reason: 'no-verified-authoritative-field' };
}

function parsePower(
  raw: JsonValue, path: string, resolver: ImportReferenceResolver | undefined,
  warnings: ImportIssue[], kind: ImportedTreasurePower['kind'] = 'treasure',
): ImportedTreasurePower {
  const row = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  const power = row && identifier(row.Power) ? reference(row.Power, resolver?.power, `${path}/Power`, warnings) : null;
  const sourceTier = row?.Tier ?? null;
  const tierId = power?.id && identifier(sourceTier) ? resolver?.tier(power.id, sourceTier) ?? null : null;
  const selection = power?.id && tierId ? { powerId: power.id, tierId } : null;
  if (!power || !identifier(sourceTier)) {
    warning(warnings, 'uninterpreted-power', path, 'Power or exact tier structure is unverified; original entry retained.');
  } else if (resolver && power.id && !tierId) {
    warning(warnings, 'unresolved-reference', `${path}/Tier`, 'Exact tier did not resolve under its owning power; no substitute chosen.');
  }
  return { kind, power, sourceTier, selection, metadata: raw };
}

function booleanField(row: JsonObject, key: string, path: string): boolean | null {
  if (!Object.hasOwn(row, key)) return null;
  if (typeof row[key] !== 'boolean') fail('invalid-field-type', pointer(path, key), 'Expected a boolean.');
  return row[key];
}

export function parseStorage(input: unknown, resolver?: ImportReferenceResolver): ImportResult<ImportedStorageSnapshot> {
  return parseInput(input, (row, warnings) => {
    const source = reportMetadata(row, 'Storage', resolver, warnings);
    const items = array(row.Items, '/Items').map((entry, index): ImportedItemInstance => {
      const path = pointer('/Items', index);
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail('malformed-entry', path, 'Expected an item object.');
      const raw = object(entry, path);
      if (!Object.hasOwn(raw, 'TypeID')) fail('missing-field', `${path}/TypeID`, 'Item TypeID is missing.');
      if (!identifier(raw.TypeID)) fail('invalid-field-type', `${path}/TypeID`, 'Expected a safe integer or nonempty source identifier.');
      const baseItemReference = reference(raw.TypeID, resolver?.item, `${path}/TypeID`, warnings);
      const displayName = textField(raw, 'Name', path, true)!;
      const level = numberField(raw, 'Level', path, false, true);
      const rarity = textField(raw, 'Rarity', path);
      const slot = textField(raw, 'Slot', path);
      const treasurePowers: ImportedTreasurePower[] = [];
      if (Object.hasOwn(raw, 'TSysPowers')) {
        if (Array.isArray(raw.TSysPowers)) {
          raw.TSysPowers.forEach((power, i) => treasurePowers.push(parsePower(power, pointer(`${path}/TSysPowers`, i), resolver, warnings)));
        } else {
          // Future/unknown layouts are useful item data, never silently dropped.
          warning(warnings, 'uninterpreted-power', `${path}/TSysPowers`, 'Expected a power array; unverified container retained without interpretation.');
          treasurePowers.push({ kind: 'treasure', power: null, sourceTier: null, selection: null, metadata: raw.TSysPowers! });
        }
      }
      if (Object.hasOwn(raw, 'TSysImbuePower') || Object.hasOwn(raw, 'TSysImbuePowerTier')) {
        treasurePowers.push(parsePower({ Power: raw.TSysImbuePower ?? null, Tier: raw.TSysImbuePowerTier ?? null }, path, resolver, warnings, 'imbue'));
      }
      return {
        originalTypeId: raw.TypeID, baseItemReference, baseItemId: baseItemReference.id,
        displayName, ...(level === null ? {} : { level }), ...(rarity === null ? {} : { rarity }),
        sourcePath: path, slot, treasurePowers,
        // Imbues stay distinguishable until their build application is designed.
        existingPowers: treasurePowers.flatMap(power => power.kind === 'treasure' && power.selection ? [power.selection] : []),
        location: { isInInventory: booleanField(raw, 'IsInInventory', path), storageVault: textField(raw, 'StorageVault', path) },
        equippedState: { status: 'unknown' }, sparkHistory: { status: 'unavailable' },
        provenance: source, metadata: raw,
      };
    });
    warning(warnings, 'equipped-state-unavailable', '', 'No verified authoritative equipped-state field is supported. Inventory contents do not establish a loadout.');
    return { source, items, equippedStateCapability: detectEquippedStateCapability() };
  });
}

export function parseStorageJson(text: string, resolver?: ImportReferenceResolver): ImportResult<ImportedStorageSnapshot> {
  return parseText(text, input => parseStorage(input, resolver));
}
