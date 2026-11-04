import { isValidCriticalSkillLevel, type ManualCriticalLevels } from '../../core/calculation/critical-skills';

/**
 * T0013-F2 critical scenario inputs, remembered for this browser session only (sessionStorage). They are calculation
 * scenario choices, not build content: never part of BuildDocument v1, never autosaved and never uploaded. A
 * CharacterSheet import or reimport never changes them.
 */
export const CRITICAL_SCENARIO_KEY = 'gorgonbuilder.session.critical-scenario';
export const CRITICAL_SCENARIO_VERSION = 1 as const;

export type EliteSetting = 'unknown' | 'elite' | 'non-elite';

export interface CriticalScenario {
  /** Official Anatomy sub-skill ID of the selected creature type; null = Unknown. */
  readonly creatureType: string | null;
  readonly elite: EliteSetting;
  /** Manual overrides by official sub-skill ID. Absent = use the imported level when available. */
  readonly manualLevels: ManualCriticalLevels;
}

export const DEFAULT_CRITICAL_SCENARIO: CriticalScenario = Object.freeze({ creatureType: null, elite: 'unknown', manualLevels: Object.freeze({}) });

function storage(): Storage | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
}

/** Validate untrusted stored JSON; unknown or invalid fields fall back to defaults without throwing. */
export function parseCriticalScenario(value: unknown): CriticalScenario {
  if (typeof value !== 'object' || value === null || (value as { version?: unknown }).version !== CRITICAL_SCENARIO_VERSION) return DEFAULT_CRITICAL_SCENARIO;
  const row = value as Record<string, unknown>;
  const creatureType = typeof row.creatureType === 'string' && row.creatureType.trim() ? row.creatureType : null;
  const elite: EliteSetting = row.elite === 'elite' || row.elite === 'non-elite' ? row.elite : 'unknown';
  const manualLevels: Record<string, number> = {};
  if (typeof row.manualLevels === 'object' && row.manualLevels !== null) {
    for (const [skillId, level] of Object.entries(row.manualLevels)) if (skillId.trim() && isValidCriticalSkillLevel(level)) manualLevels[skillId] = level;
  }
  return { creatureType, elite, manualLevels };
}

export function readCriticalScenario(): CriticalScenario {
  try {
    const text = storage()?.getItem(CRITICAL_SCENARIO_KEY);
    return text ? parseCriticalScenario(JSON.parse(text)) : DEFAULT_CRITICAL_SCENARIO;
  } catch { return DEFAULT_CRITICAL_SCENARIO; }
}

export function writeCriticalScenario(scenario: CriticalScenario): void {
  try {
    const store = storage();
    if (!store) return;
    const empty = scenario.creatureType === null && scenario.elite === 'unknown' && Object.keys(scenario.manualLevels).length === 0;
    if (empty) store.removeItem(CRITICAL_SCENARIO_KEY);
    else store.setItem(CRITICAL_SCENARIO_KEY, JSON.stringify({ version: CRITICAL_SCENARIO_VERSION, ...scenario }));
  } catch { /* Session-only convenience; the in-page state still applies. */ }
}

export const eliteFlag = (elite: EliteSetting): boolean | null => elite === 'unknown' ? null : elite === 'elite';
