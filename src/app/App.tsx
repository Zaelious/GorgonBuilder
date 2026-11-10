import { useEffect, useRef, useState } from 'react';
import { createDefaultBuildDocument, type BuildDocument } from '../core/build/document';
import { loadGameDataRepository } from '../data/repository/load';
import type { GameDataRepository } from '../data/repository/repository';
import { ImportCharacter } from '../features/import/ImportCharacter';
import type { ImportSession } from '../features/import/inventory';
import { createDraftAutosave } from '../persistence/local/autosave';
import { createLocalPersistence, type SaveResult } from '../persistence/local/storage';
import { editBuild, type BuildEdit, type Slot } from './editor/build-editor';
import { BuildTitle } from './editor/BuildTitle';
import { BrandHeader } from './BrandHeader';
import { PlannerBody } from './PlannerBody';
import { navigate, parseRoute, useLocation } from './router';
import { AccountProvider, useAccount } from '../features/account/AccountContext';
import type { AccountApi } from '../features/account/api';
import { AppNav } from '../features/account/AppNav';
import { useCloudSave } from '../features/sharing/CloudSave';
import { MyBuilds } from '../features/sharing/MyBuilds';
import { SharedBuildView } from '../features/sharing/SharedBuildView';
import { AuthorPage, ProfilePage } from '../features/sharing/ProfilePages';
import { discardReplacedDraft, readCloudLink, readReplacedDrafts, type CloudLink, type ReplacedDraft } from '../features/sharing/workspace';
import { persistCloudLink, replaceWorkingDraft } from '../features/sharing/replace-working';
import { formatTime } from '../features/sharing/format';
import './planner.css';
import '../features/sharing/sharing.css';

function saveError(result: Exclude<SaveResult, { ok: true }>): string {
  switch (result.reason) {
    case 'unsupported-version': return `Saved schema ${result.schemaVersion} is unsupported. The stored draft is protected from overwrite. Use a compatible app version to recover it.`;
    case 'unavailable': return 'Browser storage is unavailable. Changes remain in this page only; enable local storage and retry saving.';
    case 'read-failed': return 'The local draft could not be read. Editing is disabled to protect unread data. Restore storage access, then reload this page to recover the draft.';
    case 'write-failed': return 'The local draft could not be saved. Storage may be full or blocked. Keep this page open, free storage, and retry saving.';
    default: return 'The local draft contains invalid data. A new build is shown; your next build edit will replace the invalid draft.';
  }
}

function BuildEditor({ data, imported, setImported }: { data: GameDataRepository; imported: ImportSession | null; setImported: (session: ImportSession | null) => void }) {
  const account = useAccount();
  const [session] = useState(() => {
    const local = createLocalPersistence({ gameDataVersion: data.gameDataVersion });
    return { local, restored: local.restoreDraft(), preferences: local.restorePreferences() };
  });
  const [minimumEquipmentLevel, setMinimumEquipmentLevel] = useState(session.preferences.value.minimumEquipmentLevel);
  const [preferenceResult, setPreferenceResult] = useState<SaveResult | null>(session.preferences.status === 'fallback' ? session.preferences.error : null);
  const [build, setBuild] = useState(session.restored.value);
  const current = useRef(build);
  // T0020: which My Builds record (if any) this working draft came from; kept beside the draft.
  const [link, setLinkState] = useState<CloudLink | null>(readCloudLink);
  const linkRef = useRef(link);
  // Unsaved builds kept when the working build was replaced (bounded list, see workspace.ts).
  const [backups, setBackups] = useState<ReplacedDraft[]>(() => { const kept = readReplacedDrafts(); return kept.ok ? kept.entries : []; });
  const [backupError, setBackupError] = useState<string | null>(null);
  const [detailSlot, setDetailSlot] = useState<Slot | null>(null);
  const [recoveryVisible, setRecoveryVisible] = useState(true);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  // Undo for mods cleared automatically by a skill change; valid only until the next edit.
  const [cleared, setCleared] = useState<{ previous: BuildDocument; next: BuildDocument; message: string } | null>(null);
  const [saveState, setSaveState] = useState(session.restored.status === 'restored' ? 'Local draft restored' : 'No changes saved yet');
  // True while storage could not record the cloud link for the build in memory; retried after
  // every successful autosave so storage never pairs this draft with a different record.
  const linkPending = useRef(false);
  const [linkWarning, setLinkWarning] = useState(false);
  const [autosave] = useState(() => createDraftAutosave(session.local, {
    onResult: result => {
      setSaveResult(result);
      if (result.ok) setRecoveryVisible(false);
      setSaveState(result.ok ? 'Saved in this browser' : 'Changes are not saved');
      if (result.ok && linkPending.current && persistCloudLink(linkRef.current)) { linkPending.current = false; setLinkWarning(false); }
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

  // Leaving for the OAuth provider: write any pending local edit first; a failed write blocks
  // the redirect until the user retries or explicitly accepts losing those changes.
  useEffect(() => account.onBeforeRedirect(() => {
    const result = autosave.flush();
    return result === null || result.ok;
  }), [account, autosave]);

  function setLink(next: CloudLink | null) {
    linkRef.current = next;
    setLinkState(next);
    const stored = persistCloudLink(next);
    linkPending.current = !stored;
    setLinkWarning(!stored);
  }

  /**
   * Replace the working build through the shared storage transaction (replace-working.ts):
   * backup, old link removal, incoming draft and incoming link are all stored before anything
   * in the editor changes. On failure the editor, its link and every backup stay as they were
   * and the returned message explains what to do.
   */
  function replaceWorking(next: BuildDocument, nextLink: CloudLink | null, consume?: number): string | null {
    if (readOnly) return 'This draft is protected, so it was not replaced. Follow the recovery message above.';
    const flushed = autosave.flush();
    if (flushed && !flushed.ok) return 'Nothing was replaced: your latest changes could not be saved in this browser (storage may be full or blocked). Free some browser storage, then try again.';
    const result = replaceWorkingDraft({
      current: current.current, currentLink: linkRef.current, next, nextLink,
      saveDraft: document => session.local.saveDraft(document).ok,
      ...(consume === undefined ? {} : { consume }),
    });
    if (!result.ok) {
      if (result.partial) {
        // Storage now holds the incoming build unlinked; keep editing the current one and
        // re-store it (and its link) as soon as storage works again.
        autosave.schedule(current.current);
        linkPending.current = true; setLinkWarning(true);
      }
      const kept = readReplacedDrafts();
      if (kept.ok) setBackups(kept.entries);
      return result.message;
    }
    autosave.cancel();
    setBackups(result.backups);
    setBackupError(null); setCleared(null); setDetailSlot(null);
    current.current = next;
    setBuild(next);
    setSaveResult(null);
    setSaveState('Saved in this browser');
    linkRef.current = nextLink;
    setLinkState(nextLink);
    linkPending.current = false; setLinkWarning(false);
    return null;
  }

  function restoreBackup(index: number) {
    const entry = backups[index];
    if (readOnly || !entry) return;
    setBackupError(replaceWorking(entry.document, entry.link, index));
  }

  function discardBackup(index: number) {
    const entry = backups[index];
    if (!entry || !window.confirm(`Discard the kept backup “${entry.document.title}”? This cannot be undone.`)) return;
    const result = discardReplacedDraft(index);
    if (result.ok) setBackups(result.entries);
    else setBackupError('The backup could not be discarded because browser storage is unavailable. Nothing was changed.');
  }

  const cloud = useCloudSave({
    build, getBuild: () => current.current, readOnly, link, onLinkChange: setLink, onReplace: replaceWorking,
    onTitle: title => { commit({ type: 'title', title }); return current.current; },
  });

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

  /** Explicit local Save: the existing autosave flush path for the current draft (no remote save). */
  function saveNow() {
    if (readOnly) return;
    setSaveState('Saving changes…');
    autosave.schedule(current.current);
    autosave.flush();
  }

  function clearBuild() {
    if (readOnly || !window.confirm(`Clear the current working build? This removes configured skills and levels, both ability bars, equipment, imported working powers and planned mods, Spark configurations, title and notes, and target settings. My Items, imported CharacterSheet/Storage reports and browser preferences are kept.${linkRef.current ? ' The copy saved in My Builds is not changed; the cleared build starts as a new unsaved build.' : ''} This cannot be undone.`)) return;
    setCleared(null);
    setDetailSlot(null);
    apply(createDefaultBuildDocument({ gameDataVersion: data.gameDataVersion }));
    if (linkRef.current) setLink(null);
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
    <div className="planner-heading"><BuildTitle title={build.title} readOnly={readOnly} onCommit={title => commit({ type: 'title', title })} />
      <div className="planner-actions">
        <p className="save-status" id="save-status" role="status">{saveState}</p>
        <ImportCharacter data={data} session={imported} onApply={setImported} />
        <button type="button" className={account.enabled ? 'save-draft save-local' : 'save-draft'} disabled={readOnly} onClick={saveNow} aria-label="Save local draft" aria-describedby="save-status"
          title="Save this draft in this browser now. Changes also save automatically; nothing is uploaded.">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM8 3v5h7V3M8 21v-7h8v7" /></svg>{account.enabled ? 'Save locally' : 'Save'}</button>
        {cloud.actions}
        <button type="button" className="clear-build" disabled={readOnly} onClick={clearBuild}>Clear build</button>
      </div>
    </div>
    {cloud.status}
    {backups.length > 0 && <div className="notice cloud-notice info backup-notice" role="status">
      <p>{backups.length === 1 ? 'An unsaved build was kept on this device when another build replaced it.' : `${backups.length} unsaved builds are kept on this device.`}</p>
      <ul className="backup-list">{backups.map((entry, index) => <li key={`${entry.replacedAt}-${index}`}>
        <span>“{entry.document.title}” was kept on this device {formatTime(entry.replacedAt)}</span>
        <span className="notice-actions"><button type="button" disabled={readOnly} aria-label={`Restore “${entry.document.title}”`} onClick={() => restoreBackup(index)}>Restore</button>
          <button type="button" aria-label={`Discard “${entry.document.title}”`} onClick={() => discardBackup(index)}>Discard</button></span>
      </li>)}</ul></div>}
    {linkWarning && <p className="notice cloud-notice warning" role="alert">This browser could not record which My Builds record this build belongs to (storage may be full or blocked). It retries automatically after the next local save. Until then, avoid reloading: after a reload this build would show as not saved to My Builds, and saving it would create a new build.</p>}
    {backupError && <div className="notice cloud-notice warning" role="alert"><p>{backupError}</p>
      <button type="button" className="notice-dismiss" aria-label="Dismiss backup message" onClick={() => setBackupError(null)}>×</button></div>}
    {recoveryVisible && session.restored.status === 'fallback' && <p className="notice warning" role="alert">{saveError(session.restored.error)}</p>}
    {versionMismatch && <p className="notice warning" role="alert">This draft uses game data {build.gameDataVersion}; loaded data is {data.gameDataVersion}. The saved version and selections are preserved. Editing is disabled because the original snapshot is unavailable.</p>}
    {saveResult && !saveResult.ok && <div className="notice warning" role="alert"><p>{saveError(saveResult)}</p><button type="button" onClick={() => autosave.flush()}>Retry saving</button></div>}
    <PlannerBody build={build} data={data} readOnly={readOnly} onEdit={commit} imported={imported} detailSlot={detailSlot} onDetailOpen={setDetailSlot}
      minimum={minimumEquipmentLevel} preferenceProtected={preferenceProtected} preferenceNotice={preferenceNotice} onMinimumChange={updateMinimum}
      skillNotice={cleared && <p>
        <span>{cleared.message}</span>
        <button type="button" onClick={undoCleared}>Undo</button>
        <button type="button" className="notice-dismiss" aria-label="Dismiss cleared mods notice" onClick={() => setCleared(null)}>×</button>
      </p>} />
    <footer className="planner-footer"><span>Draft game data: {build.gameDataVersion} · Loaded: {data.gameDataVersion} · Schema {build.schemaVersion}</span><span>Some portions copyright {new Date().getFullYear()} Elder Game, LLC. · {account.enabled ? 'Autosaves in this browser; Save build stores it in your account' : 'Local draft only'}</span></footer>
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

function Routes({ data }: { data: GameDataRepository }) {
  const location = useLocation();
  // The imported CharacterSheet/Storage session is page memory only; keep it across in-app pages.
  const [imported, setImported] = useState<ImportSession | null>(null);
  const route = parseRoute(location.split('?')[0]!);
  switch (route.name) {
    case 'planner': return <BuildEditor data={data} imported={imported} setImported={setImported} />;
    case 'my-builds': return <MyBuilds data={data} />;
    case 'profile': return <ProfilePage data={data} />;
    case 'author': return <AuthorPage username={route.username} data={data} />;
    case 'build': return <SharedBuildView key={route.id} id={route.id} data={data} />;
    default: return <div className="notice"><h1>Page not found</h1><p>This address does not match a GorgonBuilder page.</p>
      <button type="button" onClick={() => navigate('/')}>Open the planner</button></div>;
  }
}

function AccountNotice() {
  const account = useAccount();
  const notice = account.notice;
  if (!notice) return null;
  return <div className={`notice cloud-notice ${notice.tone}`} role={notice.tone === 'warning' ? 'alert' : 'status'}><p>{notice.text}</p>
    <button type="button" className="notice-dismiss" aria-label="Dismiss notice" onClick={() => account.setNotice(null)}>×</button></div>;
}

export function App({ accountApi }: { accountApi?: AccountApi } = {}) {
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

  return <AccountProvider {...(accountApi ? { api: accountApi } : {})}><div className="app-shell">
    <BrandHeader />
    <AppNav />
    <main className="planner-main">
      <AccountNotice />
      {load.status === 'loading' && <section className="notice" role="status"><h1>Loading official game data…</h1><p>Preparing the build planner.</p></section>}
      {load.status === 'error' && <section className="notice" role="alert"><h1>Game data could not be loaded</h1><p>Check your connection and retry. Your stored draft has not been changed.</p><button type="button" onClick={() => { setLoad({ status: 'loading' }); setAttempt(n => n + 1); }}>Retry loading game data</button></section>}
      {load.status === 'ready' && <Routes data={load.data} />}
    </main>
  </div></AccountProvider>;
}
