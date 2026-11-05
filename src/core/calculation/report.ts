import type { ModifierAggregationResult, ModifierScope, ModifierSource, NormalizedModifier } from './modifiers';

function scopeText(scope: ModifierScope): string {
  switch (scope.kind) {
    case 'general': return `general${scope.delivery ? ` (${scope.delivery})` : ''}`;
    case 'skill': return `skill ${scope.skillId}`;
    case 'ability-attribute-hook': return `abilities hooking ${scope.attributeId} via ${scope.hook}`;
    case 'damage-type': return `${scope.damageType}${scope.delivery ? ` (${scope.delivery})` : ' (delivery unspecified)'}`;
    case 'ability-keyword': return `${scope.skillId} abilities with keyword ${scope.keyword}`;
  }
}

function sourceText(source: ModifierSource | ModifierAggregationResult['unsupported'][number]['source']): string {
  switch (source.kind) {
    case 'skill-advancement': return `${source.skillId} [${source.slots.join('+')}] L${source.level} ${source.advancement} ${source.tableId} (${source.levels.length} level entries)`;
    case 'skill': return `${source.skillId} [${source.slots.join('+')}] L${source.levels.join('/')}`;
    case 'item-fixed-effect': return `${source.equipmentKey} ${source.itemKind} ${source.itemId ?? '(no base)'} fixed[${source.effectIndex}]`;
    case 'existing-power':
    case 'candidate-mod': return `${source.equipmentKey} ${source.itemKind} ${source.origin} ${source.powerId}/${source.tierId} effect[${source.effectIndex}]`;
    case 'equipment': return `${source.equipmentKey} ${source.itemKind} ${source.itemId ?? '(no base)'}`;
  }
}

export { sourceText as formatModifierSource };

function valueText(modifier: NormalizedModifier): string {
  return modifier.unit === 'fraction' ? `${modifier.sourceValue} (fraction)` : modifier.sourceValue;
}

/** Deterministic plain-text review report (architect review / later breakdown prototyping). */
export function formatAggregationReport(result: ModifierAggregationResult, title: string): string {
  const lines = [`# ${title}`, '',
    `Game data ${result.gameDataVersion} (build saved with ${result.buildGameDataVersion}); active skills: ${result.activeSkillIds.join(', ') || '(none)'}`,
    `Modifiers ${result.summary.modifierCount} · unsupported ${result.summary.unsupportedCount} · warnings ${result.summary.warningCount}`,
    `By confidence: ${Object.entries(result.summary.byConfidence).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    `By source: ${Object.entries(result.summary.bySourceKind).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    '', '## Supported modifiers', ''];
  for (const m of result.modifiers) {
    lines.push(`- ${m.category} | ${m.operation} ${valueText(m)} | ${m.attributeId} "${m.attributeLabel ?? ''}" | ${scopeText(m.scope)} | ${m.applicability}`
      + `${m.conditions.length ? ` [${m.conditions.map(c => c.kind === 'requires-active-skill' ? `requires ${c.skillId}: ${c.status}`
        : c.kind === 'source-qualifier' ? `qualifier ${c.qualifier}`
          : c.kind === 'target-elite' ? `target ${c.elite ? 'Elite' : 'non-Elite'}: ${c.status}` : `target ${c.creatureTypeIds.join('/')}: ${c.status}`).join('; ')}]` : ''}`
      + ` | ${m.confidence} | ${sourceText(m.source)}`);
  }
  lines.push('', '## Unsupported / unresolved effects', '');
  for (const u of result.unsupported) lines.push(`- ${u.reason}${u.attributeId ? ` ${u.attributeId}` : ''} | ${sourceText(u.source)} | ${u.message}`);
  lines.push('', '## Warnings', '');
  for (const w of result.warnings) lines.push(`- ${w.code} | ${w.message}`);
  return `${lines.join('\n')}\n`;
}
