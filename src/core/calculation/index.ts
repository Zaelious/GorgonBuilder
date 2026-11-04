export { aggregateBuildModifiers, type AggregateOptions } from './aggregate';
export * from './modifiers';
export {
  DEFAULT_MODIFIER_RULES, createModifierRegistry, defaultModifierRegistry, getMappingIndex, parseEffectDescription,
  type AttributeInterpretation, type MappingIndex, type ModifierDataContext, type ModifierMappingRule, type ModifierRegistry, type ParsedEffect,
} from './registry';
export { formatAggregationReport } from './report';
export { calculateAbilityDamage, ABILITY_DAMAGE_ASSUMPTIONS } from './ability-damage';
export * from './ability-damage-types';
export { formatAbilityDamageReport } from './ability-damage-report';
export {
  applyTargetDummy, burstTargetFalloff, linearDirectBurstEstimate, BURST_FALLOFF_RULES, TARGET_DAMAGE_ASSUMPTIONS,
  type BurstCoverage, type BurstFalloff, type TargetDamageOptions, type TargetDamageResult, type TargetDamageTypeStep,
  type TargetHitResult, type TargetStep, type TargetStepKind,
} from './target-damage';
export {
  TREASURE_EFFECT_RULES, TREASURE_RULE_ASSUMPTIONS, interpretTreasureEffect,
  type TreasureEffectDraft, type TreasureEffectInterpretation, type TreasureEffectRule,
} from './treasure-effect-rules';
export {
  CRITICAL_SYSTEMS, PHRENOLOGY_CATEGORY_ALIASES, creatureTypes, criticalChanceAtLevel, criticalChanceTable, criticalSkillFor, getCreatureType,
  resolveAbilityCriticalSystem,
  type AbilityCriticalSystem, type CreatureType, type CriticalChanceTable, type CriticalChanceThreshold, type CriticalRulesData, type CriticalSystemId,
} from './critical-rules';
export {
  CRITICAL_SKILL_LEVEL_MAX, CRITICAL_SKILL_LEVEL_MIN, importedCriticalSkill, importedCriticalSkillSummary, isCriticalSkill,
  isValidCriticalSkillLevel, resolveCriticalSkillLevel, setManualCriticalLevel,
  type CriticalSkillLevel, type ImportedCriticalSkill, type ManualCriticalLevels,
} from './critical-skills';
export {
  CRITICAL_ASSUMPTIONS, calculateCriticalHit,
  type CriticalDamageResult, type CriticalData, type CriticalHitResult, type CriticalInputs, type CriticalModifierDecision, type CriticalStep, type CriticalTerm,
} from './critical-damage';
export { CRITICAL_TREASURE_ASSUMPTIONS, CRITICAL_TREASURE_RULES } from './critical-treasure-rules';
