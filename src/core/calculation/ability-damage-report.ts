import type { AbilityDamageResult } from './ability-damage-types';
import { formatModifierSource } from './report';

/** Plain-text review artifact, independent of React and filesystem access. */
export function formatAbilityDamageReport(result: AbilityDamageResult): string {
  const ability = result.ability;
  const lines = [
    `# ${ability?.displayName ?? 'Missing ability'} (${result.requestedAbilityId})`, '',
    'Synthetic calculation, not an observed in-game measurement.',
    `Data: ${result.gameDataVersion}; aggregation: ${result.aggregation.gameDataVersion}; build: ${result.aggregation.buildGameDataVersion}`,
    `Identity: ${ability?.internalName ?? 'unresolved'}; skill: ${ability?.skill.sourceId ?? 'unresolved'}; level: ${ability?.level ?? 'unresolved'}; published rank: ${ability?.rank ?? 'absent'}`,
    `Source: ${JSON.stringify(result.provenance)}`,
    `Official damage fields: ${JSON.stringify(ability?.damage ?? null)}`,
    `Official PvE hooks: ${JSON.stringify(ability?.pve.attributeHooks ?? null)}`,
    `Official embedded DoTs: ${JSON.stringify(ability?.pve.dots ?? null)}`,
    `Context: ${result.context}; formula: ${result.formula}`,
    `Final normal: ${result.normalDamage ?? 'unavailable'}; provisional supported subset: ${result.provisionalDamage ?? 'unavailable'}; critical: unavailable`,
    `Overall confidence: ${result.confidence}`, '',
  ];
  for (const component of result.components) {
    lines.push(`## ${component.id}: ${component.originalBase ?? 'absent'} ${component.damageType} (${component.baseStatus})`,
      `Path: ${component.sourcePath}; delivery: ${component.delivery}`,
      `Final normal: ${component.normalDamage ?? 'unavailable'}; provisional: ${component.provisionalDamage ?? 'unavailable'}; confidence: ${component.confidence}`, '');
    if (component.baseStatus === 'absent') {
      lines.push(`All ${component.decisions.length} modifier records are excluded from this absent field.`, '');
      continue;
    }
    for (const step of component.steps) lines.push(`- ${step.category}: ${step.explanation} Rule: ${step.ruleConfidence}; input + rule: ${step.confidence}; source: ${step.modifierKey ?? 'official base'}`);
    lines.push('', 'Applicability:', '');
    for (const decision of component.decisions) {
      const m = decision.modifier;
      lines.push(`- ${decision.status} | ${decision.reason} | ${m.key} | ${m.category} ${m.value} ${m.unit} | ${m.attributeId}`,
        `  ${decision.explanation} Source: ${formatModifierSource(m.source)}. Input confidence: ${m.confidence}. Conditions: ${JSON.stringify(m.conditions)}.`);
    }
    lines.push('');
  }
  lines.push('## Unsupported sources (not added)', '');
  for (const u of result.aggregation.unsupported) lines.push(`- ${u.key}: ${u.reason}; ${u.message} Source: ${formatModifierSource(u.source)}.`);
  lines.push('', '## Aggregation warnings', '');
  for (const w of result.aggregation.warnings) lines.push(`- ${w.code}: ${w.message}`);
  lines.push('', '## Calculation warnings', '');
  for (const w of result.warnings) lines.push(`- ${w.code}${w.componentId ? ` [${w.componentId}]` : ''}${w.modifierKey ? ` ${w.modifierKey}` : ''}: ${w.message}`);
  lines.push('', '## Assumptions requiring game validation', '');
  for (const assumption of result.assumptions) lines.push(`- ${assumption}`);
  return `${lines.join('\n')}\n`;
}
