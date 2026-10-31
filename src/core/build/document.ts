import type { NormalizedAbility } from '../../data/normalized/abilities';
import type { NormalizedItem, NormalizedTreasurePower, NormalizedTreasureTier } from '../../data/normalized/items-treasure';
import type { JsonObject, NormalizedSkill } from '../../data/normalized/progression';

export const BUILD_SCHEMA_VERSION = 1 as const;

export interface SkillSlot {
  skillId: NormalizedSkill['id'] | null;
  /** User selection only; duplicate skills may retain different levels. */
  level: number;
}

export interface AbilitySelection {
  /** Official record ID already identifies the exact ability upgrade. */
  abilityId: NormalizedAbility['id'];
  /** Published Rank only, including null. Never inferred from Level or a name. */
  rank: NormalizedAbility['rank'];
}

export interface TreasureTierSelection {
  powerId: NormalizedTreasurePower['id'];
  /** Original tier key scoped to powerId; never a display tier number. */
  tierId: NormalizedTreasureTier['id'];
}

export interface CandidateMod {
  powerId: NormalizedTreasurePower['id'];
  /** null permits staging a power before choosing its tier. */
  tierId: NormalizedTreasureTier['id'] | null;
}

export interface SourceMetadata {
  reference?: string;
  exportedAt?: string;
  reportVersion?: string;
  /** Unknown instance/report properties remain uninterpreted JSON. */
  metadata?: JsonObject;
}

export interface ItemInstance {
  /** null supports a manual instance without a known database definition. */
  baseItemId: NormalizedItem['id'] | null;
  instanceId?: string;
  displayName?: string;
  level?: number;
  rarity?: string;
  existingPowers: TreasureTierSelection[];
  provenance?: SourceMetadata;
  metadata?: JsonObject;
}

export type EquipmentItem =
  | { kind: 'database'; itemId: NormalizedItem['id'] }
  | { kind: 'manual'; instance: ItemInstance }
  | { kind: 'imported'; instance: ItemInstance };

/** Counts of outcomes, not interpreted modifiers or damage contributions. */
export interface SparkOutcomeCounts {
  allDirectDamagePercent: number;
  skillDamageFlat: number;
  allDirectDamageFlat: number;
  skillDamagePercent: number;
  skillBaseDamagePercent: number;
}

export interface SparkSimulationInput {
  category: 'skill-damage';
  skillId: NormalizedSkill['id'];
  count: number;
  seed: string;
}

export interface SparkSimulationResult {
  modelVersion: string;
  outcomeCounts: SparkOutcomeCounts;
}

export type SparkConfiguration =
  | { mode: 'none' }
  | { mode: 'simulated'; input: SparkSimulationInput; result?: SparkSimulationResult }
  | { mode: 'actual'; category: 'skill-damage'; skillId: NormalizedSkill['id']; outcomeCounts: SparkOutcomeCounts };

export interface EquipmentSelection {
  /** Exact official slot string, including racial/cosmetic/shield slots. */
  slot: NormalizedItem['slot'];
  item: EquipmentItem;
  /** Ordered, exploratory candidates; distinct from existing instance powers. */
  candidateMods: CandidateMod[];
  sparks: SparkConfiguration;
}

export interface TargetDamageTypeSettings {
  /** Reserved user inputs. Units/application are deliberately deferred to T0014. */
  resistance?: number;
  vulnerability?: number;
  metadata?: JsonObject;
}

export interface TargetConfiguration {
  count: number;
  /** Keys are published damage-type names, not an invented closed enum. */
  damageTypes: Record<string, TargetDamageTypeSettings>;
  metadata?: JsonObject;
}

export interface CharacterImportReference extends SourceMetadata {
  characterName?: string;
  server?: string;
}

/** Serializable planning state only. No UI state, definitions or owner tokens. */
export interface BuildDocument {
  schemaVersion: typeof BUILD_SCHEMA_VERSION;
  gameDataVersion: string;
  createdWithAppVersion?: string;
  title: string;
  notes: string;
  skillSlotA: SkillSlot;
  skillSlotB: SkillSlot;
  abilityBarA: AbilitySelection[];
  abilityBarB: AbilitySelection[];
  equipment: EquipmentSelection[];
  target: TargetConfiguration;
  characterImport?: CharacterImportReference;
}

export interface BuildDefaults {
  /** Pass the loaded runtime repository's version; do not silently assume v490. */
  gameDataVersion: string;
  createdWithAppVersion?: string;
}

export function createDefaultBuildDocument(options: BuildDefaults): BuildDocument {
  if (!options.gameDataVersion.trim() ||
    (options.createdWithAppVersion !== undefined && !options.createdWithAppVersion.trim())) {
    throw new TypeError('Build version metadata must be nonempty.');
  }
  return {
    schemaVersion: BUILD_SCHEMA_VERSION,
    gameDataVersion: options.gameDataVersion,
    ...(options.createdWithAppVersion === undefined ? {} : { createdWithAppVersion: options.createdWithAppVersion }),
    title: 'Untitled build', notes: '',
    skillSlotA: { skillId: null, level: 0 },
    skillSlotB: { skillId: null, level: 0 },
    abilityBarA: [], abilityBarB: [], equipment: [],
    target: { count: 1, damageTypes: {} },
  };
}

/** Stable A-then-B order; never reconciles levels or merges ability bars. */
export function getUniqueActiveSkillIds(build: Pick<BuildDocument, 'skillSlotA' | 'skillSlotB'>): string[] {
  return [...new Set([build.skillSlotA.skillId, build.skillSlotB.skillId]
    .filter((id): id is string => id !== null))];
}
