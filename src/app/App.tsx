import { useEffect, useRef, useState } from 'react';
import type { BuildDocument } from '../core/build/document';
import { loadGameDataRepository } from '../data/repository/load';
import type { GameDataRepository } from '../data/repository/repository';
import { SkillPlanner } from '../features/skills/SkillPlanner';
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
    return { local, restored: local.restoreDraft() };
  });
  const [build, setBuild] = useState(session.restored.value);
  const current = useRef(build);
  const [detailSlot, setDetailSlot] = useState<Slot | null>(null);
  const [recoveryVisible, setRecoveryVisible] = useState(true);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
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

  function commit(edit: BuildEdit) {
    if (readOnly) return;
    const next: BuildDocument = editBuild(current.current, edit, data);
    if (next === current.current) return;
    current.current = next;
    setBuild(next);
    setSaveResult(null);
    setSaveState('Saving changes…');
    autosave.schedule(next);
  }

  return <>
    <div className="planner-heading"><div><p className="eyebrow">Skill & ability planner</p><BuildTitle title={build.title} readOnly={readOnly} onCommit={title => commit({ type: 'title', title })} /></div><p className="save-status" role="status">{saveState}</p></div>
    <p className="introduction">Choose your combat skills. Add up to six abilities to each bar; open a slot to inspect or change it.</p>
    {recoveryVisible && session.restored.status === 'fallback' && <p className="notice warning" role="alert">{saveError(session.restored.error)}</p>}
    {versionMismatch && <p className="notice warning" role="alert">This draft uses game data {build.gameDataVersion}; loaded data is {data.gameDataVersion}. The saved version and selections are preserved. Editing is disabled because the original snapshot is unavailable.</p>}
    {saveResult && !saveResult.ok && <div className="notice warning" role="alert"><p>{saveError(saveResult)}</p><button type="button" onClick={() => autosave.flush()}>Retry saving</button></div>}
    <section className="skills-section" aria-labelledby="skills-abilities-title"><div className="section-heading"><h2 id="skills-abilities-title">Skills &amp; Abilities</h2><span className="muted">Two independent combat bars</span></div><div className="planner-grid">
      <SkillPlanner slot="A" skill={build.skillSlotA} bar={build.abilityBarA} data={data} onEdit={commit} readOnly={readOnly} detailSlot={detailSlot} onDetailOpen={setDetailSlot} />
      <SkillPlanner slot="B" skill={build.skillSlotB} bar={build.abilityBarB} data={data} onEdit={commit} readOnly={readOnly} detailSlot={detailSlot} onDetailOpen={setDetailSlot} />
    </div></section>
    <footer className="planner-footer"><span>Draft game data: {build.gameDataVersion} · Loaded: {data.gameDataVersion} · Schema {build.schemaVersion}</span><span>Some portions copyright {new Date().getFullYear()} Elder Game, LLC. · Local draft only</span></footer>
  </>;
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
      {load.status === 'loading' && <section className="notice" role="status"><h1>Loading official game data…</h1><p>Preparing the skill and ability planner.</p></section>}
      {load.status === 'error' && <section className="notice" role="alert"><h1>Game data could not be loaded</h1><p>Check your connection and retry. Your stored draft has not been changed.</p><button type="button" onClick={() => { setLoad({ status: 'loading' }); setAttempt(n => n + 1); }}>Retry loading game data</button></section>}
      {load.status === 'ready' && <BuildEditor data={load.data} />}
    </main>
  </div>;
}
