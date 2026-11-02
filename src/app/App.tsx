import { useEffect, useRef, useState } from 'react';
import type { BuildDocument } from '../core/build/document';
import { loadGameDataRepository } from '../data/repository/load';
import type { GameDataRepository } from '../data/repository/repository';
import { SkillPlanner } from '../features/skills/SkillPlanner';
import { EquipmentPlanner } from '../features/equipment/EquipmentPlanner';
import { ImportCharacter } from '../features/import/ImportCharacter';
import type { ImportSession } from '../features/import/inventory';
import { createDraftAutosave } from '../persistence/local/autosave';
import { createLocalPersistence, type SaveResult } from '../persistence/local/storage';
import { editBuild, type BuildEdit, type Slot } from './editor/build-editor';
import { BuildTitle } from './editor/BuildTitle';
import './planner.css';

function saveError(result: Exclude<SaveResult, { ok: true }>): string {
  switch (result.reason) {
    case 'unsupported-version': return `Saved schema ${result.schemaVersion} is unsupported. The stored draft is protected from overwrite. Use a compatible app version to recover it.`;
    case 'unavailable': return 'Browser storage is unavailable. Changes remain in this page only; enable local storage and retry saving.';
    case 'read-failed': return 'The local draft could not be read. Editing is disabled to protect unread data. Restore storage access, then reload this page to recover the draft.';
    case 'write-failed': return 'The local draft could not be saved. Storage may be full or blocked. Keep this page open, free storage, and retry saving.';
    default: return 'The local draft contains invalid data. A new build is shown; your next build edit will replace the invalid draft.';
  }
}

function BuildEditor({ data }: { data: GameDataRepository }) {
  const [session] = useState(() => {
    const local = createLocalPersistence({ gameDataVersion: data.gameDataVersion });
    return { local, restored: local.restoreDraft(), preferences: local.restorePreferences() };
  });
  const [minimumEquipmentLevel, setMinimumEquipmentLevel] = useState(session.preferences.value.minimumEquipmentLevel);
  const [preferenceResult, setPreferenceResult] = useState<SaveResult | null>(session.preferences.status === 'fallback' ? session.preferences.error : null);
  const [build, setBuild] = useState(session.restored.value);
  const [imported, setImported] = useState<ImportSession | null>(null);
  const current = useRef(build);
  const [detailSlot, setDetailSlot] = useState<Slot | null>(null);
  const [recoveryVisible, setRecoveryVisible] = useState(true);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  // Undo for mods cleared automatically by a skill change; valid only until the next edit.
  const [cleared, setCleared] = useState<{ previous: BuildDocument; next: BuildDocument; message: string } | null>(null);
  const [saveState, setSaveState] = useState(session.restored.status === 'restored' ? 'Local draft restored' : 'No changes saved yet');
  const [autosave] = useState(() => createDraftAutosave(session.local, {
    onResult: result => {
      setSaveResult(result);
      if (result.ok) setRecoveryVisible(false);
      setSaveState(result.ok ? 'Saved in this browser' : 'Changes are not saved');
    },
  }));
  const versionMismatch = build.gameDataVersion !== data.gameDataVersion;
  const protectedDraft = session.restored.status === 'fallback' &&
    (session.restored.error.reason === 'unsupported-version' || session.restored.error.reason === 'read-failed');
  const readOnly = versionMismatch || protectedDraft;

  useEffect(() => {
    const flush = () => { autosave.flush(); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      autosave.flush();
      autosave.cancel();
    };
  }, [autosave]);

  function apply(next: BuildDocument) {
    current.current = next;
    setBuild(next);
    setSaveResult(null);
    setSaveState('Saving changes…');
    autosave.schedule(next);
  }

  function commit(edit: BuildEdit) {
    if (readOnly) return;
    const previous = current.current;
    const next: BuildDocument = editBuild(previous, edit, data);
    if (next === previous) return;
    apply(next);
    setCleared(edit.type === 'skill' ? clearedNotice(previous, next, edit.slot, data) : null);
  }

  function undoCleared() {
    if (readOnly || !cleared || current.current !== cleared.next) { setCleared(null); return; }
    apply(cleared.previous);
    setCleared(null);
  }

  const preferenceProtected = preferenceResult !== null && !preferenceResult.ok &&
    (preferenceResult.reason === 'unsupported-version' || preferenceResult.reason === 'read-failed');
  function updateMinimum(value: number | null) {
    setMinimumEquipmentLevel(value);
    setPreferenceResult(session.local.updatePreferences({ minimumEquipmentLevel: value }));
  }
  const preferenceNotice = preferenceResult && !preferenceResult.ok ? <div className="notice warning" role="alert">
    <p>{preferenceResult.reason === 'unsupported-version'
      ? 'Saved preferences use an unsupported version and are protected from overwrite. Use a compatible app to change the minimum.'
      : preferenceResult.reason === 'read-failed' ? 'Saved preferences could not be read and are protected. Restore storage access and reload.'
        : preferenceResult.reason === 'invalid-data' || preferenceResult.reason === 'invalid-json'
          ? 'Saved preferences are invalid. The default minimum is shown; changing it will replace the invalid preferences.'
          : 'The minimum target level could not be saved. It applies in this page only. Restore storage access and retry.'}</p>
    {!preferenceProtected && preferenceResult.reason !== 'invalid-data' && preferenceResult.reason !== 'invalid-json' &&
      <button type="button" onClick={() => updateMinimum(minimumEquipmentLevel)}>Retry saving preference</button>}
  </div> : null;

  return <>
    <div className="planner-heading"><BuildTitle title={build.title} readOnly={readOnly} onCommit={title => commit({ type: 'title', title })} /><ImportCharacter data={data} session={imported} onApply={setImported} /><p className="save-status" role="status">{saveState}</p></div>
    {recoveryVisible && session.restored.status === 'fallback' && <p className="notice warning" role="alert">{saveError(session.restored.error)}</p>}
    {versionMismatch && <p className="notice warning" role="alert">This draft uses game data {build.gameDataVersion}; loaded data is {data.gameDataVersion}. The saved version and selections are preserved. Editing is disabled because the original snapshot is unavailable.</p>}
    {saveResult && !saveResult.ok && <div className="notice warning" role="alert"><p>{saveError(saveResult)}</p><button type="button" onClick={() => autosave.flush()}>Retry saving</button></div>}
    <section className="skills-section" aria-labelledby="skills-abilities-title"><div className="section-heading"><h2 id="skills-abilities-title">Skills &amp; Abilities</h2>
      <details className="planner-help" onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.open = false; e.currentTarget.querySelector<HTMLElement>('summary')?.focus(); }
      }}><summary aria-label="Planner help">?</summary><div className="planner-help-content">
        <p>Select skills and levels, then use + to browse abilities. Open an equipped icon for details and bar controls. Changing a skill clears its bar and staged mods for a skill no longer in either slot (with Undo). Both slots can use the same skill.</p>
      </div></details>
    </div><div className="planner-grid">
      <SkillPlanner slot="A" skill={build.skillSlotA} bar={build.abilityBarA} data={data} onEdit={commit} readOnly={readOnly} detailSlot={detailSlot} onDetailOpen={setDetailSlot} equipment={build.equipment} />
      <SkillPlanner slot="B" skill={build.skillSlotB} bar={build.abilityBarB} data={data} onEdit={commit} readOnly={readOnly} detailSlot={detailSlot} onDetailOpen={setDetailSlot} equipment={build.equipment} />
    </div>
    <div className="skill-change-notice" aria-live="polite">{cleared && <p>
      <span>{cleared.message}</span>
      <button type="button" onClick={undoCleared}>Undo</button>
      <button type="button" className="notice-dismiss" aria-label="Dismiss cleared mods notice" onClick={() => setCleared(null)}>×</button>
    </p>}</div></section>
    <EquipmentPlanner build={build} data={data} imported={imported} onEdit={commit} readOnly={readOnly} minimum={minimumEquipmentLevel}
      preferenceProtected={preferenceProtected} preferenceNotice={preferenceNotice} onMinimumChange={updateMinimum} />
    <footer className="planner-footer"><span>Draft game data: {build.gameDataVersion} · Loaded: {data.gameDataVersion} · Schema {build.schemaVersion}</span><span>Some portions copyright {new Date().getFullYear()} Elder Game, LLC. · Local draft only</span></footer>
  </>;
}

function stagedCount(build: BuildDocument) {
  return build.equipment.reduce((sum, selection) => sum + selection.candidateMods.length, 0);
}

/** Concise feedback for candidates removed atomically with a skill change. */
function clearedNotice(previous: BuildDocument, next: BuildDocument, slot: Slot, data: GameDataRepository) {
  const removed = stagedCount(previous) - stagedCount(next);
  if (removed <= 0) return null;
  const items = previous.equipment.filter((selection, index) => next.equipment[index] !== selection).length;
  const departed = (slot === 'A' ? previous.skillSlotA : previous.skillSlotB).skillId ?? '';
  const name = data.getSkill(departed)?.name ?? departed;
  return { previous, next, message: `Removed ${removed} staged ${name} mod${removed === 1 ? '' : 's'} from ${items} item${items === 1 ? '' : 's'}.` };
}

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: GameDataRepository };

export function App() {
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    loadGameDataRepository().then(data => {
      if (active) setLoad({ status: 'ready', data });
    }).catch(() => {
      if (active) setLoad({ status: 'error' });
    });
    return () => { active = false; };
  }, [attempt]);

  return <div className="app-shell">
    <header className="site-header"><span className="wordmark">Gorgon Builder</span><span className="project-label">Project Gorgon build planner</span></header>
    <main className="planner-main">
      {load.status === 'loading' && <section className="notice" role="status"><h1>Loading official game data…</h1><p>Preparing the build planner.</p></section>}
      {load.status === 'error' && <section className="notice" role="alert"><h1>Game data could not be loaded</h1><p>Check your connection and retry. Your stored draft has not been changed.</p><button type="button" onClick={() => { setLoad({ status: 'loading' }); setAttempt(n => n + 1); }}>Retry loading game data</button></section>}
      {load.status === 'ready' && <BuildEditor data={load.data} />}
    </main>
  </div>;
}
