import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameDataRepository } from '../../data/repository/repository';
import { createLocalPersistence } from '../../persistence/local/storage';
import { ApiError, type BuildRecord } from '../account/api';
import { useAccount } from '../account/AccountContext';
import { authorPath, buildPath, navigate, onLinkClick } from '../../app/router';
import { PlannerBody } from '../../app/PlannerBody';
import type { Slot } from '../../app/editor/build-editor';
import { ShareDialog, VisibilityBadge } from './ShareDialog';
import { copyTitle, formatTime } from './format';
import { openRecordInPlanner } from './open-build';
import { readCloudLink, syncLinkMetadata, writeCloudLink } from './workspace';

type Load = { status: 'loading' } | { status: 'missing' } | { status: 'error'; message: string } | { status: 'ready'; record: BuildRecord };

/**
 * `/builds/:id`. Anyone may view Public/Unlisted builds read-only; Private and missing builds
 * look identical ("not available"). The owner gets Edit/Share/Delete; other signed-in users
 * Copy to My Builds; guests are asked to sign in and return to this page. Never touches the
 * local working draft unless the owner explicitly chooses Edit.
 */
export function SharedBuildView({ id, data }: { id: string; data: GameDataRepository }) {
  const account = useAccount();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [detailSlot, setDetailSlot] = useState<Slot | null>(null);
  const [minimum, setMinimum] = useState(() => createLocalPersistence({ gameDataVersion: data.gameDataVersion }).restorePreferences().value.minimumEquipmentLevel);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'warning' } | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const signedIn = account.state.kind === 'user';
  const username = account.username;
  const enabled = account.enabled;
  const checking = account.state.kind === 'checking';

  const { api, failure } = account;
  const fetchBuild = useCallback(async () => {
    setLoad({ status: 'loading' });
    try { setLoad({ status: 'ready', record: await api.getBuild(id) }); } catch (error) {
      if (error instanceof ApiError && error.status === 404) setLoad({ status: 'missing' });
      else setLoad({ status: 'error', message: failure(error, 'load this build') });
    }
  }, [api, failure, id]);
  // Re-read when the viewer's identity changes: the owner receives the full document.
  useEffect(() => { if (enabled) void fetchBuild(); }, [fetchBuild, enabled, username]);

  async function run(task: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage(null);
    try { await task(); } finally { inFlight.current = false; setBusy(false); }
  }

  if (checking) return <p className="notice" role="status">Loading build…</p>;
  if (!enabled) return <div className="notice"><h1>Shared builds are not available here</h1><p>This site does not have saved or shared builds yet. The planner works and saves in this browser.</p>
    <button type="button" onClick={() => navigate('/')}>Open the planner</button></div>;
  if (load.status === 'loading') return <p className="notice" role="status">Loading build…</p>;
  if (load.status === 'missing') return <div className="notice"><h1>Build not available</h1>
    <p>This build is private, was deleted, or the link is incorrect. If it is yours, sign in with the account that saved it.</p>
    <div className="notice-actions">{!signedIn && <button type="button" onClick={() => account.requestSignIn('Sign in to view your own private builds.')}>Sign in</button>}
      <button type="button" onClick={() => navigate('/')}>Open the planner</button></div></div>;
  if (load.status === 'error') return <div className="notice warning" role="alert"><p>{load.message}</p><button type="button" onClick={() => void fetchBuild()}>Retry</button></div>;

  const record = load.record;
  const owner = username !== null && record.author !== null && record.author.username.toLowerCase() === username.toLowerCase();
  const inPlanner = owner && readCloudLink()?.buildId === record.id;

  const copy = () => {
    if (!signedIn) { account.requestSignIn('Sign in to copy this build to My Builds. You will return to this page.'); return; }
    if (username === null) { account.requestUsername(); return; }
    void run(async () => {
      try {
        const copied = await account.api.copyBuild(record.id, owner ? copyTitle(record.title) : undefined);
        account.setNotice({ tone: 'info', text: `Copied to My Builds as a Private build. The original is unchanged.` });
        navigate(buildPath(copied.id));
      } catch (error) { setMessage({ tone: 'warning', text: account.failure(error, 'copy the build') }); }
    });
  };
  const edit = () => void run(async () => {
    const result = openRecordInPlanner(record, username!, data.gameDataVersion);
    if (result.status === 'failed') setMessage({ tone: 'warning', text: result.message });
    else if (result.status !== 'cancelled') {
      if (result.status === 'continued') account.setNotice({ tone: 'info', text: `Continuing your unsaved changes to “${record.title}”.` });
      navigate('/');
    }
  });
  const remove = () => {
    if (!window.confirm(`Delete “${record.title}” from My Builds? Anyone with its link will lose access. This cannot be undone.`)) return;
    void run(async () => {
      try {
        await account.api.deleteBuild(record.id, record.revision);
        if (readCloudLink()?.buildId === record.id) writeCloudLink(null);
        account.setNotice({ tone: 'info', text: `Deleted “${record.title}”.` });
        navigate('/my-builds');
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) { setMessage({ tone: 'warning', text: 'This build changed elsewhere and was not deleted. Reloaded the latest version.' }); void fetchBuild(); }
        else setMessage({ tone: 'warning', text: account.failure(error, 'delete the build') });
      }
    });
  };

  return <article className="shared-build" aria-labelledby="shared-build-title">
    <div className="planner-heading shared-heading">
      <div className="shared-title">
        <h1 id="shared-build-title">{record.title}</h1>
        <p className="shared-meta">
          <VisibilityBadge visibility={record.visibility} />
          {record.author && <span>by <a href={authorPath(record.author.username)} onClick={event => onLinkClick(event, authorPath(record.author!.username))}>{record.author.username}</a></span>}
          <span>Updated {formatTime(record.updatedAt)}</span>
          <span className="read-only-badge">Read-only view</span>
        </p>
      </div>
      <div className="planner-actions">
        {owner ? <>
          <button type="button" className="primary-action" disabled={busy} onClick={edit}>{inPlanner ? 'Continue in planner' : 'Edit in planner'}</button>
          <button type="button" disabled={busy} onClick={() => setSharing(true)}>Share</button>
          <button type="button" disabled={busy} onClick={copy}>Duplicate</button>
          <button type="button" className="danger-action" disabled={busy} onClick={remove}>Delete</button>
        </> : <button type="button" className="primary-action" disabled={busy} onClick={copy}>{busy ? 'Copying…' : signedIn ? 'Copy to My Builds' : 'Sign in to copy'}</button>}
      </div>
    </div>
    {record.publicDescription.trim() && <p className="shared-description">{record.publicDescription}</p>}
    {owner && record.visibility === 'private' && <p className="muted shared-private-note">Only you can see this Private build. Use Share to create a link others can open.</p>}
    {message && <p className={`notice cloud-notice ${message.tone}`} role={message.tone === 'warning' ? 'alert' : 'status'}>{message.text}</p>}
    {record.document.gameDataVersion !== data.gameDataVersion && <p className="notice warning" role="alert">This build uses game data {record.document.gameDataVersion}; the loaded data is {data.gameDataVersion}. Some details may not display.</p>}
    <PlannerBody build={record.document} data={data} readOnly onEdit={() => {}} imported={null} detailSlot={detailSlot} onDetailOpen={setDetailSlot}
      minimum={minimum} preferenceProtected={false} preferenceNotice={null} onMinimumChange={setMinimum} />
    {sharing && owner && <ShareDialog target={record} document={record.document} onClose={() => setSharing(false)}
      onUpdated={updated => {
        setLoad({ status: 'ready', record: updated });
        const link = readCloudLink();
        if (link?.buildId === updated.id) writeCloudLink(syncLinkMetadata(link, updated));
      }} />}
  </article>;
}
