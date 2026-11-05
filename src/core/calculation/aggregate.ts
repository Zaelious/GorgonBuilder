import { getUniqueActiveSkillIds } from '../build/document';
import type { BuildDocument, CandidateMod, EquipmentSelection, SkillSlot } from '../build/document';
import {
  CONFIDENCE_ORDER, MODIFIER_AGGREGATION_SCHEMA_VERSION,
  type AggregationWarning, type EquipmentSourceRef, type ModifierAggregationResult, type ModifierApplicability,
  type ModifierCategory, type ModifierCondition, type ModifierConfidence, type ModifierSource, type NormalizedModifier,
  type SkillSlotName, type TargetConditionContext, type UnsupportedEffect, type UnsupportedReason, type UnsupportedSkillSource,
} from './modifiers';
import { defaultModifierRegistry, parseEffectDescription, type ModifierDataContext, type ModifierRegistry } from './registry';
import { interpretTreasureEffect, type TreasureEffectRule, type TreasureTargetCondition } from './treasure-effect-rules';

export interface AggregateOptions {
  /** Defaults to the documented initial mapping subset. */
  readonly registry?: ModifierRegistry;
  /** Auditable alternative rule sets, e.g. the preserved T0014 coverage baseline. */
  readonly treasureRules?: readonly TreasureEffectRule[];
  /** Reusable unconditional named-damage prose grammar; on by default, off only for preserved coverage baselines. */
  readonly proseGrammar?: boolean;
  /** T0013-F2 target dummy creature type / Elite state for curated target-conditional rules. Omitted = unknown. */
  readonly target?: TargetConditionContext;
}

/** Evaluate a curated target condition against the scenario; unknown inputs stay unevaluated. */
function targetCondition(condition: TreasureTargetCondition, target: TargetConditionContext | undefined): ModifierCondition {
  if (condition.kind === 'elite') {
    const elite = target?.elite ?? null;
    return { kind: 'target-elite', elite: condition.elite, status: elite === null ? 'unevaluated' : elite === condition.elite ? 'met' : 'not-met' };
  }
  const creature = target?.creatureType ?? null;
  const status = creature === null || condition.ambiguousCreatureTypeIds.includes(creature) ? 'unevaluated'
    : condition.creatureTypeIds.includes(creature) ? 'met' : 'not-met';
  return { kind: 'target-creature-type', creatureTypeIds: condition.creatureTypeIds, ambiguousCreatureTypeIds: condition.ambiguousCreatureTypeIds, status };
}

const ADVANCEMENT_SUM_ASSUMPTION = 'Advancement-table entries are treated as per-level increments and summed for levels 1..configured level; unvalidated.';
const ADVANCEMENT_COMBINE_ASSUMPTION = 'Each unique active skill reports its own advancement rewards; how two skills\' rewards combine in game is unvalidated.';

/** Lower confidence wins (validated > partially_validated > assumed > unknown). */
function weakest(a: ModifierConfidence, b: ModifierConfidence): ModifierConfidence {
  return CONFIDENCE_ORDER.indexOf(a) >= CONFIDENCE_ORDER.indexOf(b) ? a : b;
}

/** Exact decimal sum for published numbers (avoids 0.1 + 0.2 drift in totals). */
function sumDecimals(values: readonly number[]): { value: number; text: string } {
  const places = Math.max(0, ...values.map(value => (String(value).split('.')[1] ?? '').length));
  if (values.some(value => /e/iu.test(String(value))) || places > 12) {
    const value = values.reduce((total, next) => total + next, 0);
    return { value, text: String(value) };
  }
  const scale = 10 ** places;
  const scaled = values.reduce((total, next) => total + Math.round(next * scale), 0);
  const value = scaled / scale;
  return { value, text: String(value) };
}

function applicability(conditions: readonly ModifierCondition[]): ModifierApplicability {
  if (conditions.length === 0) return 'unconditional';
  if (conditions.some(condition => condition.status === 'not-met')) return 'conditions-not-met';
  if (conditions.some(condition => condition.status === 'unevaluated')) return 'conditions-unevaluated';
  return 'conditions-met';
}

interface Collector {
  readonly modifiers: NormalizedModifier[];
  readonly unsupported: UnsupportedEffect[];
  readonly warnings: AggregationWarning[];
}

interface EffectInput {
  readonly key: string;
  readonly description: string;
  readonly source: ModifierSource;
}

/**
 * Pure and deterministic: reads `build` and `data` only, never mutates them, and returns fresh
 * records in source order (unique active skills A→B, then equipment array order: fixed effects,
 * effective existing powers, staged candidate mods). Spark settings are not aggregated (T0015).
 * Imported `metadata.sourceItem` / `originalWorkingPowers` are historical evidence and never read.
 */
export function aggregateBuildModifiers(build: BuildDocument, data: ModifierDataContext, options: AggregateOptions = {}): ModifierAggregationResult {
  const registry = options.registry ?? defaultModifierRegistry;
  const out: Collector = { modifiers: [], unsupported: [], warnings: [] };
  const activeSkillIds = getUniqueActiveSkillIds(build);
  if (build.gameDataVersion !== data.gameDataVersion) {
    out.warnings.push({ code: 'game-data-version-mismatch',
      message: `Build was saved with game data ${build.gameDataVersion}; official IDs are resolved against ${data.gameDataVersion}.` });
  }

  function emitUnsupported(key: string, reason: UnsupportedReason, message: string, source: UnsupportedEffect['source'], attributeId?: string) {
    out.unsupported.push({ key, reason, message, source, ...(attributeId === undefined ? {} : { attributeId }) });
  }

  /** Map one published effect string (fixed effect or treasure tier line). */
  function interpretEffect(input: EffectInput) {
    const parsed = parseEffectDescription(input.description);
    if (parsed.kind === 'prose') {
      // Only curated exact power ID + InternalName + sentence-template rules interpret prose; no general parsing.
      const curated = input.source.kind === 'existing-power' || input.source.kind === 'candidate-mod'
        ? interpretTreasureEffect(input.source.powerId, input.description, data, options.treasureRules,
          { proseGrammar: options.proseGrammar !== false }) : null;
      if (curated?.kind === 'drafts') {
        for (const draft of curated.drafts) {
          const conditions = draft.targetCondition ? [targetCondition(draft.targetCondition, options.target)] : [];
          out.modifiers.push({
            key: `${input.key}/rule:${draft.part}`, category: draft.category, operation: draft.operation,
            attributeId: draft.attributeId, attributeLabel: draft.attributeLabel, scope: draft.scope,
            value: draft.value, sourceValue: draft.sourceValue, unit: draft.unit,
            conditions, applicability: applicability(conditions), mappingRuleId: curated.rule.id,
            confidence: curated.rule.confidence, assumptions: [...draft.assumptions], source: input.source,
          });
        }
        if (curated.rule.unmodeled) emitUnsupported(`${input.key}/remainder`, 'prose-effect',
          `${curated.rule.unmodeled} Source: "${input.description}"`, input.source);
        return;
      }
      emitUnsupported(input.key, 'prose-effect', curated?.kind === 'template-mismatch'
        ? `Published text does not match curated rule ${curated.rule.id}; not interpreted: "${input.description}"`
        : `Published text effect is not interpreted: "${input.description}"`, input.source);
      return;
    }
    if (parsed.kind === 'malformed') {
      emitUnsupported(input.key, 'malformed-effect', `Effect does not match the official {ATTRIBUTE}{value} grammar: "${input.description}"`, input.source);
      return;
    }
    const conditions: ModifierCondition[] = [];
    if (parsed.requiredSkillId !== null) {
      if (!data.getSkill(parsed.requiredSkillId)) {
        emitUnsupported(input.key, 'unknown-required-skill', `Required active skill ${parsed.requiredSkillId} is not an official skill.`, input.source, parsed.attributeId);
        return;
      }
      conditions.push({ kind: 'requires-active-skill', skillId: parsed.requiredSkillId,
        status: activeSkillIds.includes(parsed.requiredSkillId) ? 'met' : 'not-met' });
    }
    const interpretation = registry.interpretAttribute(parsed.attributeId, data);
    if (interpretation.kind === 'unsupported') {
      emitUnsupported(input.key, interpretation.reason, interpretation.message, input.source, parsed.attributeId);
      return;
    }
    const { rule, scope, attribute } = interpretation;
    out.modifiers.push({
      key: input.key, category: rule.category, operation: rule.operation,
      attributeId: attribute.id, attributeLabel: attribute.label, scope,
      value: parsed.value, sourceValue: parsed.sourceValue, unit: rule.unit,
      conditions, applicability: applicability(conditions),
      mappingRuleId: rule.id, confidence: rule.confidence, assumptions: [...rule.assumptions],
      source: input.source,
    });
  }

  aggregateSkills(build, activeSkillIds, data, registry, out, emitUnsupported);

  const occurrences = new Map<string, number>();
  build.equipment.forEach((selection, equipmentIndex) => {
    const occurrence = occurrences.get(selection.slot) ?? 0;
    occurrences.set(selection.slot, occurrence + 1);
    aggregateEquipment(selection, equipmentIndex, `${selection.slot}#${occurrence}`, data, out, interpretEffect);
  });

  const byCategory: Partial<Record<ModifierCategory, number>> = {};
  const byConfidence: Record<ModifierConfidence, number> = { validated: 0, partially_validated: 0, assumed: 0, unknown: 0 };
  const bySourceKind: Record<ModifierSource['kind'], number> = { 'skill-advancement': 0, 'item-fixed-effect': 0, 'existing-power': 0, 'candidate-mod': 0 };
  for (const modifier of out.modifiers) {
    byCategory[modifier.category] = (byCategory[modifier.category] ?? 0) + 1;
    byConfidence[modifier.confidence] += 1;
    bySourceKind[modifier.source.kind] += 1;
  }
  return {
    schemaVersion: MODIFIER_AGGREGATION_SCHEMA_VERSION,
    gameDataVersion: data.gameDataVersion,
    buildGameDataVersion: build.gameDataVersion,
    activeSkillIds,
    modifiers: out.modifiers, unsupported: out.unsupported, warnings: out.warnings,
    summary: {
      modifierCount: out.modifiers.length, unsupportedCount: out.unsupported.length, warningCount: out.warnings.length,
      byCategory, byConfidence, bySourceKind,
    },
  };
}

type EmitUnsupported = (key: string, reason: UnsupportedReason, message: string, source: UnsupportedEffect['source'], attributeId?: string) => void;

function aggregateSkills(build: BuildDocument, activeSkillIds: readonly string[], data: ModifierDataContext,
  registry: ModifierRegistry, out: Collector, emitUnsupported: EmitUnsupported) {
  const slots: [SkillSlotName, SkillSlot][] = [['A', build.skillSlotA], ['B', build.skillSlotB]];
  for (const skillId of activeSkillIds) {
    const selected = slots.filter(([, slot]) => slot.skillId === skillId);
    const slotNames = selected.map(([name]) => name);
    const levels = [...new Set(selected.map(([, slot]) => slot.level))];
    const skillSource = (extra: Partial<UnsupportedSkillSource> = {}): UnsupportedSkillSource => ({ kind: 'skill', skillId, slots: slotNames, levels, ...extra });
    const skill = data.getSkill(skillId);
    if (!skill) {
      out.warnings.push({ code: 'unknown-skill', skillId, message: `Skill ${skillId} (slot ${slotNames.join('+')}) is not in official data; no advancement rewards aggregated.` });
      continue;
    }
    if (!skill.combat) out.warnings.push({ code: 'non-combat-skill', skillId, message: `${skill.name ?? skillId} is not published as a combat skill.` });
    if (levels.length > 1) {
      // No reconciliation rule exists; aggregating either level (or both) would invent one.
      const message = `${skill.name ?? skillId} is selected in A and B with different levels (${levels.join(' vs ')}); `
        + 'level reconciliation is undefined, so its advancement rewards are omitted until the levels match.';
      out.warnings.push({ code: 'skill-level-conflict', skillId, message });
      emitUnsupported(`skill:${skillId}/level-conflict`, 'skill-level-conflict', message, skillSource());
      continue;
    }
    const level = levels[0]!;
    if (!Number.isSafeInteger(level) || level < 0) {
      out.warnings.push({ code: 'invalid-skill-level', skillId, message: `${skill.name ?? skillId} level ${level} is not a non-negative integer; no rewards aggregated.` });
      continue;
    }

    // Skill progression rewards (Ability/Recipe/Notes/BonusToSkill...) are unlocks, not modifiers.
    const rewardCounts: Record<string, number> = {};
    const rewardKeys: string[] = [];
    for (const entry of skill.progression) {
      if (entry.level > level) continue;
      rewardKeys.push(entry.sourceLevelKey);
      for (const reward of entry.rewards) rewardCounts[reward.id] = (rewardCounts[reward.id] ?? 0) + 1;
    }
    if (rewardKeys.length > 0) {
      emitUnsupported(`skill:${skillId}/progression-rewards`, 'progression-rewards-not-modifiers',
        `${skill.name ?? skillId} level ${level} unlock rewards (${Object.entries(rewardCounts).map(([id, n]) => `${id} ×${n}`).join(', ')}) are not stat modifiers.`,
        skillSource({ rewardCounts, sourceLevelKeys: rewardKeys }));
    }

    const references = [['active', skill.activeAdvancement], ['passive', skill.passiveAdvancement]] as const;
    for (const [advancement, reference] of references) {
      if (!reference) continue;
      const table = data.getAdvancementTable(reference.tableId);
      if (!table) {
        out.warnings.push({ code: 'missing-advancement-table', skillId, message: `${advancement} advancement table ${reference.tableId} is not in official data.` });
        continue;
      }
      const ordered = [...table.progression].sort((a, b) => a.level - b.level || (a.sourceLevelKey < b.sourceLevelKey ? -1 : a.sourceLevelKey > b.sourceLevelKey ? 1 : 0));
      const maxLevel = ordered.reduce((max, entry) => Math.max(max, entry.level), 0);
      if (level > maxLevel) {
        out.warnings.push({ code: 'level-exceeds-advancement-table', skillId,
          message: `${skill.name ?? skillId} level ${level} exceeds ${table.id}'s published levels (max ${maxLevel}); only published levels are summed.` });
      }
      const groups = new Map<string, { attributeId: string; qualifier: string | null; levels: { sourceLevelKey: string; level: number; value: number }[] }>();
      for (const entry of ordered) {
        if (entry.level > level) continue;
        for (const reward of entry.rewards) {
          const key = `${reward.id}@${entry.sourceQualifier ?? ''}`;
          const keyBase = `skill:${skillId}/${advancement}:${table.id}/${reward.id}${entry.sourceQualifier ? `@${entry.sourceQualifier}` : ''}`;
          if (typeof reward.value !== 'number' || !Number.isFinite(reward.value)) {
            emitUnsupported(`${keyBase}/${entry.sourceLevelKey}`, 'non-numeric-advancement-reward',
              `${table.id} ${entry.sourceLevelKey} reward ${reward.id} is not numeric.`, skillSource({ sourceLevelKeys: [entry.sourceLevelKey] }), reward.id);
            continue;
          }
          const group = groups.get(key) ?? { attributeId: reward.id, qualifier: entry.sourceQualifier, levels: [] };
          group.levels.push({ sourceLevelKey: entry.sourceLevelKey, level: entry.level, value: reward.value });
          groups.set(key, group);
        }
      }
      for (const group of groups.values()) {
        const key = `skill:${skillId}/${advancement}:${table.id}/${group.attributeId}${group.qualifier ? `@${group.qualifier}` : ''}`;
        const total = sumDecimals(group.levels.map(entry => entry.value));
        const source: ModifierSource = {
          kind: 'skill-advancement', skillId, slots: slotNames, level, advancement, tableId: table.id,
          attributeId: group.attributeId, levels: group.levels,
        };
        const interpretation = registry.interpretAttribute(group.attributeId, data);
        if (interpretation.kind === 'unsupported') {
          emitUnsupported(key, interpretation.reason, `${interpretation.message} (${table.id} total ${total.text})`, source, group.attributeId);
          continue;
        }
        const conditions: ModifierCondition[] = group.qualifier ? [{ kind: 'source-qualifier', qualifier: group.qualifier, status: 'unevaluated' }] : [];
        const { rule, scope, attribute } = interpretation;
        out.modifiers.push({
          key, category: rule.category, operation: rule.operation, attributeId: attribute.id, attributeLabel: attribute.label, scope,
          value: total.value, sourceValue: total.text, unit: rule.unit, conditions, applicability: applicability(conditions),
          mappingRuleId: rule.id, confidence: weakest(rule.confidence, 'assumed'),
          assumptions: [...rule.assumptions, ADVANCEMENT_SUM_ASSUMPTION, ADVANCEMENT_COMBINE_ASSUMPTION], source,
        });
      }
    }
  }
}

function aggregateEquipment(selection: EquipmentSelection, equipmentIndex: number, equipmentKey: string, data: ModifierDataContext,
  out: Collector, interpretEffect: (input: EffectInput) => void) {
  const { item } = selection;
  const itemId = item.kind === 'database' ? item.itemId : item.instance.baseItemId;
  const definition = itemId === null ? undefined : data.getItem(itemId);
  const instance = item.kind === 'database' ? null : item.instance;
  const ref: EquipmentSourceRef = {
    equipmentIndex, equipmentKey, slot: selection.slot, itemKind: item.kind, itemId, itemResolved: definition !== undefined,
    ...(instance?.instanceId === undefined ? {} : { instanceId: instance.instanceId }),
    ...(instance?.displayName !== undefined ? { displayName: instance.displayName } : definition ? { displayName: definition.displayName } : {}),
  };
  const prefix = `equipment:${equipmentKey}`;

  if (itemId === null) {
    out.warnings.push({ code: 'instance-without-base-item', equipment: ref,
      message: `${ref.displayName ?? 'Item'} in ${selection.slot} has no official base item; no fixed effects are aggregated.` });
  } else if (!definition) {
    out.warnings.push({ code: 'unknown-item', equipment: ref,
      message: `Item ${itemId} in ${selection.slot} is not in official equipment data; no fixed effects are aggregated.` });
  }
  (definition?.fixedEffects ?? []).forEach((effect, effectIndex) => {
    interpretEffect({
      key: `${prefix}/fixed:${effectIndex}`, description: effect.description,
      source: { kind: 'item-fixed-effect', ...ref, effectIndex, effectRecordId: effect.source.recordId, description: effect.description },
    });
  });

  const aggregateMods = (mods: readonly CandidateMod[], origin: 'existing' | 'planned') => {
    const seen = new Map<string, number>();
    mods.forEach((mod, modIndex) => {
      const identity = `${mod.powerId}:${mod.tierId ?? 'unselected'}`;
      const occurrence = seen.get(identity) ?? 0;
      seen.set(identity, occurrence + 1);
      const modKey = `${prefix}/${origin === 'existing' ? 'existing' : 'candidate'}:${identity}#${occurrence}`;
      const label = origin === 'existing' ? 'Existing power' : 'Planned candidate';
      const base = { equipment: ref, powerId: mod.powerId, tierId: mod.tierId, modIndex, origin } as const;
      const power = data.getTreasurePower(mod.powerId);
      if (!power) {
        out.warnings.push({ code: 'unknown-power', ...base, message: `${label} ${mod.powerId} on ${selection.slot} is not an official treasure power; retained without modifiers.` });
        return;
      }
      if (mod.tierId === null) {
        out.warnings.push({ code: 'candidate-tier-unselected', ...base, message: `${label} ${power.internalName} on ${selection.slot} has no tier chosen; no modifiers until a tier is selected.` });
        return;
      }
      const tierId = mod.tierId;
      const tier = data.getTreasureTier(mod.powerId, tierId);
      if (!tier) {
        out.warnings.push({ code: 'unknown-tier', ...base,
          message: `${label} ${power.internalName} tier ${mod.tierId} on ${selection.slot} is not an official tier of this power; not substituted.` });
        return;
      }
      tier.effectDescriptions.forEach((description, effectIndex) => {
        interpretEffect({
          key: `${modKey}/effect:${effectIndex}`, description,
          source: {
            kind: origin === 'existing' ? 'existing-power' : 'candidate-mod', ...ref, modIndex, origin,
            powerId: mod.powerId, tierId, effectIndex, tierRecordId: tier.source.recordId, description,
          },
        });
      });
    });
  };
  // Effective working pairs only (T0011-F2). Never metadata.sourceItem or originalWorkingPowers.
  if (instance) aggregateMods(instance.existingPowers, 'existing');
  aggregateMods(selection.candidateMods, 'planned');

  if (selection.sparks.mode !== 'none') {
    out.warnings.push({ code: 'sparks-not-aggregated', equipment: ref,
      message: `Mastery Spark settings (${selection.sparks.mode}) on ${selection.slot} are not aggregated until T0015.` });
  }
}
