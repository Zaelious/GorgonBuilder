import { useMemo, useState, type ReactNode } from 'react';
import type { BuildDocument } from '../core/build/document';
import type { GameDataRepository } from '../data/repository/repository';
import { SkillPlanner } from '../features/skills/SkillPlanner';
import { EquipmentPlanner } from '../features/equipment/EquipmentPlanner';
import { TargetDummy } from '../features/abilities/TargetDummy';
import type { AbilityDamageInputs } from '../features/abilities/AbilityResults';
import { aggregateBuildModifiers, getCreatureType, resolveCriticalSkillLevel } from '../core/calculation';
import { eliteFlag, readCriticalScenario, writeCriticalScenario, type CriticalScenario } from '../persistence/local/critical-scenario';
import type { ImportSession } from '../features/import/inventory';
import { useSessionFlag } from './useSessionFlag';
import type { BuildEdit, Slot } from './editor/build-editor';

export interface PlannerBodyProps {
  build: BuildDocument;
  data: GameDataRepository;
  readOnly: boolean;
  onEdit: (edit: BuildEdit) => void;
  imported: ImportSession | null;
  detailSlot: Slot | null;
  onDetailOpen: (slot: Slot | null) => void;
  minimum: number | null;
  preferenceProtected: boolean;
  preferenceNotice: ReactNode;
  onMinimumChange: (value: number | null) => void;
  /** Transient notice under the skill bars (skill-change Undo). */
  skillNotice?: ReactNode;
}

/**
 * Skills, abilities and equipment for one BuildDocument. The working-draft editor and the
 * read-only shared-build page (T0020) render the same planner; read-only mode never edits.
 */
export function PlannerBody({ build, data, readOnly, onEdit, imported, detailSlot, onDetailOpen, minimum, preferenceProtected, preferenceNotice, onMinimumChange, skillNotice }: PlannerBodyProps) {
  // Calculation UI is opt-in for this browser session (not saved in the build). When on, one pure aggregation per
  // committed build feeds every equipped ability result.
  const [damageAnalysis, setDamageAnalysis] = useSessionFlag('damageAnalysis');
  // T0013-F2 critical scenario (creature type, Elite, manual sub-skill levels): browser-session state, never the build.
  const [criticalScenario, setCriticalScenarioState] = useState<CriticalScenario>(readCriticalScenario);
  const updateCriticalScenario = (next: CriticalScenario) => { setCriticalScenarioState(next); writeCriticalScenario(next); };
  const character = imported?.character;
  const damageInputs = useMemo<AbilityDamageInputs | undefined>(() => {
    if (!damageAnalysis) return undefined;
    const creatureType = getCreatureType(criticalScenario.creatureType, data)?.id ?? null;
    return {
      aggregation: aggregateBuildModifiers(build, data, { target: { creatureType, elite: eliteFlag(criticalScenario.elite) } }),
      target: build.target,
      critical: { creatureType, skillLevel: skillId => resolveCriticalSkillLevel(skillId, { snapshot: character, manualLevels: criticalScenario.manualLevels }, data) },
    };
  }, [build, data, damageAnalysis, criticalScenario, character]);

  return <>
    <section className="skills-section" aria-labelledby="skills-abilities-title"><div className="section-heading"><h2 id="skills-abilities-title"><svg className="section-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M12 2.5c.6 4.6 2.9 6.9 7.5 7.5-4.6.6-6.9 2.9-7.5 7.5-.6-4.6-2.9-6.9-7.5-7.5 4.6-.6 6.9-2.9 7.5-7.5Z" /></svg>Skills &amp; Abilities</h2>
      <label className="damage-analysis-toggle" title="Show calculated damage, target dummy and scenario controls. Remembered for this browser session; not saved in the build.">
        <input type="checkbox" role="switch" checked={damageAnalysis} onChange={e => setDamageAnalysis(e.target.checked)} />Damage analysis</label>
      <details className="planner-help" onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.open = false; e.currentTarget.querySelector<HTMLElement>('summary')?.focus(); }
      }}><summary aria-label="Planner help">?</summary><div className="planner-help-content">
        <p>Select skills and levels, then use + to browse abilities. Open an equipped icon for details and bar controls. Turn on Damage analysis (remembered for this browser session) to add calculated damage, the target dummy and scenario controls. Changing a skill clears its bar and staged mods for a skill no longer in either slot (with Undo). Both slots can use the same skill.</p>
      </div></details>
    </div><div className="planner-grid">
      <SkillPlanner slot="A" skill={build.skillSlotA} bar={build.abilityBarA} data={data} onEdit={onEdit} readOnly={readOnly} detailSlot={detailSlot} onDetailOpen={onDetailOpen} equipment={build.equipment} imported={imported?.character} damageInputs={damageInputs} />
      <SkillPlanner slot="B" skill={build.skillSlotB} bar={build.abilityBarB} data={data} onEdit={onEdit} readOnly={readOnly} detailSlot={detailSlot} onDetailOpen={onDetailOpen} equipment={build.equipment} imported={imported?.character} damageInputs={damageInputs} />
    </div>
    {damageAnalysis && <TargetDummy build={build} data={data} onEdit={onEdit} readOnly={readOnly}
      critical={{ scenario: criticalScenario, onChange: updateCriticalScenario, imported: character }} />}
    <div className="skill-change-notice" aria-live="polite">{skillNotice}</div></section>
    <EquipmentPlanner build={build} data={data} imported={imported} onEdit={onEdit} readOnly={readOnly} minimum={minimum}
      preferenceProtected={preferenceProtected} preferenceNotice={preferenceNotice} onMinimumChange={onMinimumChange} />
  </>;
}
