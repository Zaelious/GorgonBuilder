import { damageDebugEnabled } from './damage-debug';
import { useMemo } from 'react';
import type { EquipmentSelection } from '../../core/build/document';
import type { GameDataRepository } from '../../data/repository/repository';
import { abilityModIndexFor, relevantEquippedMods } from '../../data/search/ability-mods';
import { powerName } from '../../data/search/treasure';
import { EffectDescriptions } from '../mods/EffectDescription';
import type { AbilityDamageResult } from '../../core/calculation/ability-damage-types';

type Ability = GameDataRepository['abilities'][number];
type Row = ReturnType<typeof relevantEquippedMods>[number];

/** Source-backed equipped treasure effects for this ability family, in display order (one per source instance). */
export function useRelevantModRows(ability: Ability, equipment: readonly EquipmentSelection[], data: GameDataRepository): readonly Row[] {
  return useMemo(() => relevantEquippedMods(ability, equipment, data, abilityModIndexFor(data)), [ability, equipment, data]);
}

const matchEvidence = (match: Row['match']) => match === 'attribute' ? 'published ability attribute'
  : match === 'keyword' ? 'static official ability category/keyword' : 'official ability icon and name';

/** A source-linked mod is not necessarily part of computed direct damage. */
export function relevantModDamageStatus(row: Row, result: AbilityDamageResult | null): 'included' | 'uncertain' | 'scenario' | 'not-included' | 'relevant' {
  if (!result) return 'relevant';
  const decisions = result.components.filter(component => component.delivery === 'direct').flatMap(component =>
    component.decisions.filter(decision => {
      const source = decision.modifier.source;
      return (source.kind === 'candidate-mod' || source.kind === 'existing-power')
        && source.equipmentIndex === row.equipmentIndex
        && source.modIndex === row.index
        && source.powerId === row.mod.powerId
        && source.tierId === row.mod.tierId
        && (source.kind === 'existing-power' ? row.source === 'imported' : row.source === 'planned');
    }));
  if (decisions.some(decision => decision.status === 'applied')) return 'included';
  if (decisions.some(decision => decision.status === 'uncertain')) return 'uncertain';
  if (decisions.some(({ modifier }) => (modifier.category === 'stampede-damage-per-stack' || modifier.category === 'chance-damage-proc')
    && modifier.scope.kind === 'ability-attribute-hook' && modifier.scope.skillId === result.ability?.skill.skillId
    && result.ability?.pve.attributeHooks[modifier.scope.hook]?.includes(modifier.scope.attributeId))) return 'scenario';
  return 'not-included';
}

const rowKey = (row: Row) => `${row.equipmentIndex}:${row.source}:${row.index}`;
const slotLabel = (selection: EquipmentSelection) => selection.slot === 'OffHandShield' ? 'OffHand' : selection.slot;

function itemName(selection: EquipmentSelection, data: GameDataRepository) {
  const id = selection.item.kind === 'database' ? selection.item.itemId : selection.item.instance.baseItemId;
  return (selection.item.kind !== 'database' ? selection.item.instance.displayName : undefined) ?? (id ? data.getItem(id)?.displayName : undefined) ?? selection.slot;
}

function provenance(row: Row, selection: EquipmentSelection, data: GameDataRepository) {
  return `${slotLabel(selection)} · ${itemName(selection, data)} · ${row.source === 'planned' ? 'Planned mod' : 'Imported existing power'} · ${row.mod.powerId} / ${row.mod.tierId} · matched by ${matchEvidence(row.match)}`;
}

/**
 * Compact Relevant Mods: each effect's full original wording, once per source instance, without per-row source tags.
 * Provenance stays on each row's data attributes and in {@link RelevantModSources} (Technical details).
 */
export function RelevantMods({ rows, equipment, data, idPrefix, damageResult = null }: { rows: readonly Row[]; equipment: readonly EquipmentSelection[]; data: GameDataRepository; idPrefix: string; damageResult?: AbilityDamageResult | null }) {
  const debug = damageDebugEnabled();
  return <section className="relevant-mods" aria-label="Relevant Mods">
    <h4>Relevant Mods</h4>
    {rows.length === 0 ? <p className="muted">No ability-specific equipped mods identified.</p>
      : <ul>{rows.map((row, position) => {
        const selection = equipment[row.equipmentIndex]!;
        const power = data.getTreasurePower(row.mod.powerId);
        return <li key={rowKey(row)} data-relevant-mod={rowKey(row)} data-power-id={row.mod.powerId} data-tier-id={row.mod.tierId ?? ''}
          data-source-slot={selection.slot} data-source-kind={row.source} aria-describedby={debug ? `${idPrefix}-source-${position + 1}` : undefined} title={debug ? provenance(row, selection, data) : undefined}>
          <span className="relevant-effect"><EffectDescriptions descriptions={row.tier.effectDescriptions} data={data} fallback={power ? powerName(power) : row.mod.powerId} /></span>
          {damageResult && <small className="relevant-mod-status">{({ included: 'Included in direct damage', uncertain: 'Direct damage uncertain', scenario: 'Damage scenario', 'not-included': 'Relevant only · not added to direct damage', relevant: 'Source-relevant' } as const)[relevantModDamageStatus(row, damageResult)]}</small>}
        </li>;
      })}</ul>}
  </section>;
}

/** Full provenance for each Relevant Mod, in the same order: slot, item, planned/imported, power/tier and match evidence. */
export function RelevantModSources({ rows, equipment, data, idPrefix }: { rows: readonly Row[]; equipment: readonly EquipmentSelection[]; data: GameDataRepository; idPrefix: string }) {
  if (rows.length === 0) return null;
  return <section className="relevant-mod-sources" aria-label="Relevant mod sources">
    <p>Relevant mod sources (in list order):</p>
    <ol>{rows.map((row, position) => {
      const selection = equipment[row.equipmentIndex]!;
      return <li key={rowKey(row)} id={`${idPrefix}-source-${position + 1}`} data-relevant-source={rowKey(row)}>
        <span className="relevant-source">{slotLabel(selection)}{row.source === 'imported' ? ' · ◇ imported' : ''}</span>
        {' · '}{itemName(selection, data)} · {row.source === 'planned' ? 'Planned mod' : 'Imported existing power'} · <code>{row.mod.powerId} / {row.mod.tierId}</code>
        {' · '}matched by {matchEvidence(row.match)}
      </li>;
    })}</ol>
  </section>;
}
