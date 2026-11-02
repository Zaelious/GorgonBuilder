import type { ImportIssue, ImportResult, ImportedCharacterSnapshot, ImportedStorageSnapshot } from './contracts';

/** Safe to display locally: no names, item text, IDs, paths or unknown metadata. */
export function summarizeImport(result: ImportResult<ImportedCharacterSnapshot | ImportedStorageSnapshot>) {
  const counts = (issues: ImportIssue[]) => Object.fromEntries([...new Set(issues.map(issue => issue.code))]
    .map(code => [code, issues.filter(issue => issue.code === code).length]));
  if (!result.ok) return { recognized: false, errors: counts(result.errors), warnings: counts(result.warnings) };
  const value = result.value;
  const timestamp = Number.isFinite(Date.parse(value.source.exportedAt))
    ? new Date(Date.parse(value.source.exportedAt)).toISOString() : 'unverified (retained locally)';
  const version = value.source.sourceReportVersion;
  const reportVersion = typeof version === 'number' || /^[\w.-]{1,40}$/.test(version) ? version : 'nonstandard (retained locally)';
  const common = {
    recognized: true, report: value.source.report, exportedAt: timestamp, reportVersion,
    character: { namePresent: Boolean(value.source.characterName), serverPresent: Boolean(value.source.server) },
    gameDataVersion: value.source.resolvedWithGameDataVersion,
    warnings: counts(result.warnings),
  };
  if ('skills' in value) {
    const references = [...value.skills.map(skill => skill.reference), ...value.knownAbilities];
    return {
      ...common, skills: value.skills.length, knownAbilities: value.knownAbilities.length,
      currentStats: Object.keys(value.currentStats).length,
      unresolvedReferences: references.filter(ref => ref.status === 'unresolved').length,
      uncheckedReferences: references.filter(ref => ref.status === 'not-checked').length,
    };
  }
  const powers = value.items.flatMap(item => item.treasurePowers);
  const treasure = powers.filter(power => power.kind === 'treasure');
  const imbues = powers.filter(power => power.kind === 'imbue');
  return {
    ...common, importedItems: value.items.length,
    recognizedTreasurePowers: treasure.filter(power => power.power?.status === 'resolved').length,
    recognizedExactPowerTiers: treasure.filter(power => power.selection !== null).length,
    recognizedImbuePowerTiers: imbues.filter(power => power.selection !== null).length,
    unresolvedItemReferences: value.items.filter(item => item.baseItemReference.status === 'unresolved').length,
    uncheckedItemReferences: value.items.filter(item => item.baseItemReference.status === 'not-checked').length,
    unresolvedOrUnverifiedPowerTiers: powers.filter(power => power.selection === null).length,
    authoritativeEquippedState: value.equippedStateCapability.status,
    sparkHistory: 'unavailable',
  };
}
