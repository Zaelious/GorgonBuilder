import type { ImportReferenceResolver, SourceIdentifier } from '../../core/import/contracts';
import type { GameDataRepository } from '../repository/repository';

/** Only exact dataset IDs/internal names and checked numeric namespace keys. */
export function createImportReferenceResolver(repository: GameDataRepository): ImportReferenceResolver {
  function index(records: readonly { id: string; internalName: string }[]) {
    const names = new Map(records.map(record => [record.internalName, record.id]));
    return (source: SourceIdentifier) => names.get(String(source)) ?? null;
  }
  const abilities = index(repository.abilities);
  const powers = index(repository.treasurePowers);
  const numericSkills = new Map(repository.skills.map(skill => [skill.officialNumericId, skill.id]));
  const key = (prefix: string, source: SourceIdentifier) => typeof source === 'number' || /^\d+$/.test(source) ? `${prefix}_${source}` : source;
  return {
    gameDataVersion: repository.gameDataVersion,
    skill: source => repository.getSkill(String(source))?.id ??
      (typeof source === 'number' ? numericSkills.get(source) ?? null : null),
    ability: source => repository.getAbility(String(source))?.id ?? abilities(source),
    item: source => {
      const id = key('item', source);
      return repository.getItemCoverage(id) ? id : null;
    },
    power: source => repository.getTreasurePower(String(source))?.id ?? powers(source),
    tier: (powerId, source) => repository.getTreasureTier(powerId, key('id', source))?.id ?? null,
  };
}
