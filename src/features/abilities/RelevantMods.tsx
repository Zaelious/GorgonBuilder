import { useMemo } from 'react';
import type { EquipmentSelection } from '../../core/build/document';
import type { GameDataRepository } from '../../data/repository/repository';
import { abilityModIndexFor, relevantEquippedMods } from '../../data/search/ability-mods';
import { powerName } from '../../data/search/treasure';
import { EffectDescriptions } from '../mods/EffectDescription';

type Ability = GameDataRepository['abilities'][number];

/** Always-visible equipped treasure effects with a source-backed link to this ability family. */
export function RelevantMods({ ability, equipment, data }: { ability: Ability; equipment: readonly EquipmentSelection[]; data: GameDataRepository }) {
  const rows = useMemo(() => relevantEquippedMods(ability, equipment, data, abilityModIndexFor(data)), [ability, equipment, data]);
  const itemName = (selection: EquipmentSelection) => {
    const id = selection.item.kind === 'database' ? selection.item.itemId : selection.item.instance.baseItemId;
    return (selection.item.kind !== 'database' ? selection.item.instance.displayName : undefined) ?? (id ? data.getItem(id)?.displayName : undefined) ?? selection.slot;
  };
  return <section className="relevant-mods" aria-label="Relevant Mods">
    <h4>Relevant Mods</h4>
    {rows.length === 0 ? <p className="muted">No ability-specific equipped mods identified.</p>
      : <ul>{rows.map(row => {
        const selection = equipment[row.equipmentIndex]!;
        const power = data.getTreasurePower(row.mod.powerId);
        return <li key={`${row.equipmentIndex}-${row.source}-${row.index}`} data-relevant-mod={`${row.equipmentIndex}:${row.source}:${row.index}`}
          data-power-id={row.mod.powerId} data-tier-id={row.mod.tierId ?? ''}
          title={`${row.source === 'planned' ? 'Planned mod' : 'Imported existing power'} on ${itemName(selection)} · ${row.mod.powerId} / ${row.mod.tierId} · matched by ${row.match === 'attribute' ? 'published ability attribute' : 'official ability icon and name'}`}>
          <span className="relevant-effect"><EffectDescriptions descriptions={row.tier.effectDescriptions} data={data} fallback={power ? powerName(power) : row.mod.powerId} /></span>
          <span className="relevant-source">{selection.slot === 'OffHandShield' ? 'OffHand' : selection.slot}{row.source === 'imported' ? ' · ◇ imported' : ''}</span>
        </li>;
      })}</ul>}
  </section>;
}
