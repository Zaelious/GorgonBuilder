/**
 * T0020 planner account saving. The working build always autosaves locally (T0007); these
 * controls additionally save it to the signed-in account's My Builds, with explicit, separate
 * Save build / Save changes / Save as new actions and revision-aware conflict handling.
 */
import { useRef, useState, type ReactNode } from 'react';
import type { BuildDocument } from '../../core/build/document';
import { ApiError, type BuildRecord, type Visibility } from '../account/api';
import { useAccount } from '../account/AccountContext';
import { Modal } from '../account/Modal';
import { buildPath, navigate, onLinkClick } from '../../app/router';
import { BUILD_PUBLIC_DESCRIPTION_MAX_LENGTH, BUILD_TITLE_MAX_LENGTH } from '../../persistence/remote/build-record';
import { PublicationReview, ShareDialog, VISIBILITY_HELP, VISIBILITY_LABEL, VisibilityBadge } from './ShareDialog';
import { cloudState, documentForEditing, linkFor, syncLinkMetadata, type CloudLink } from './workspace';

export interface CloudSaveOptions {
  build: BuildDocument;
  /** Latest committed build (async-safe). */
  getBuild: () => BuildDocument;
  readOnly: boolean;
  link: CloudLink | null;
  onLinkChange: (link: CloudLink | null) => void;
  /** Commit a new title into the working BuildDocument; returns the committed document. */
  onTitle: (title: string) => BuildDocument;
  /** Replace the working build (keeping a recoverable backup of unsaved work). */
  onReplace: (document: BuildDocument, link: CloudLink | null) => void;
}

const CloudIcon = () => <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z" /><path d="M12 11v5m-2.5-2.5L12 11l2.5 2.5" /></svg>;

export function useCloudSave({ build, getBuild, readOnly, link, onLinkChange, onTitle, onReplace }: CloudSaveOptions): { actions: ReactNode; status: ReactNode } {
  const account = useAccount();
  const [dialog, setDialog] = useState<'save-new' | 'share' | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'warning'; retry?: () => void } | null>(null);
  const [conflict, setConflict] = useState(false);

  if (!account.enabled) return { actions: null, status: null };
  const signedIn = account.state.kind === 'user';
  const username = account.username;
  const owned = link !== null && username !== null && link.ownerUsername.toLowerCase() === username.toLowerCase();
  const state = owned ? cloudState(build, link) : 'local-only';

  /** Single-flight guard: repeated clicks never send a second write. */
  async function run(task: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { await task(); } finally { inFlight.current = false; setBusy(false); }
  }

  function requireAccount(reason: string): boolean {
    if (account.state.kind === 'unavailable') { setMessage({ tone: 'warning', text: 'The account service is unavailable right now. Your work is saved in this browser.', retry: () => void account.refresh() }); return false; }
    if (!signedIn) { account.requestSignIn(reason); return false; }
    if (username === null) { account.requestUsername(); return false; }
    return true;
  }

  async function createNew(title: string, publicDescription: string, visibility: Visibility) {
    await run(async () => {
      const document = title === getBuild().title ? getBuild() : onTitle(title);
      try {
        const record = await account.api.createBuild({ document, title, publicDescription, visibility });
        onLinkChange(linkFor(record, record.author?.username ?? username!, document));
        setConflict(false); setDialog(null);
        setMessage({ tone: 'info', text: `Saved to My Builds as ${VISIBILITY_LABEL[record.visibility]}.` });
      } catch (error) {
        setMessage({ tone: 'warning', text: account.failure(error, 'save the build'), retry: () => void createNew(title, publicDescription, visibility) });
        throw error;
      }
    });
  }

  async function saveChanges(expectedRevision = link?.revision) {
    if (!link || expectedRevision === undefined) return;
    await run(async () => {
      const document = getBuild();
      try {
        const record = await account.api.updateBuild(link.buildId, { expectedRevision, document, title: document.title });
        onLinkChange(linkFor(record, link.ownerUsername, document));
        setConflict(false);
        setMessage({ tone: 'info', text: 'Changes saved to My Builds.' });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) { setConflict(true); setMessage(null); return; }
        if (error instanceof ApiError && error.status === 404) {
          onLinkChange(null);
          setMessage({ tone: 'warning', text: 'This build no longer exists in My Builds (it may have been deleted). Your work is still here; use Save build to save it again.' });
          return;
        }
        setMessage({ tone: 'warning', text: account.failure(error, 'save your changes'), retry: () => void saveChanges(expectedRevision) });
      }
    });
  }

  async function overwrite() {
    if (!link || !window.confirm('Replace the version saved in My Builds with the build shown here? Changes saved elsewhere will be lost.')) return;
    let latest: BuildRecord;
    try { latest = await account.api.getBuild(link.buildId); } catch (error) { setMessage({ tone: 'warning', text: account.failure(error, 'load the saved version') }); return; }
    await saveChanges(latest.revision);
  }

  async function loadLatest() {
    if (!link) return;
    await run(async () => {
      try {
        const record = await account.api.getBuild(link.buildId);
        const document = documentForEditing(record);
        onReplace(document, linkFor(record, link.ownerUsername, document));
        setConflict(false);
        setMessage({ tone: 'info', text: 'Loaded the latest saved version. Your previous edits were kept as a backup you can restore.' });
      } catch (error) { setMessage({ tone: 'warning', text: account.failure(error, 'load the saved version') }); }
    });
  }

  const disabled = readOnly || busy;
  const actions = <>
    {!owned && <button type="button" className="cloud-save primary-action" disabled={disabled}
      onClick={() => { if (requireAccount('Sign in to save this build to My Builds.')) setDialog('save-new'); }}>
      <CloudIcon />{busy ? 'Saving…' : 'Save build'}</button>}
    {owned && <>
      <button type="button" className="cloud-save primary-action" disabled={disabled || state === 'saved'} aria-describedby="cloud-status"
        onClick={() => { if (requireAccount('Sign in again to save your changes.')) void saveChanges(); }}>
        <CloudIcon />{busy ? 'Saving…' : state === 'saved' ? 'Saved' : 'Save changes'}</button>
      <button type="button" className="secondary-action" disabled={disabled} onClick={() => { if (requireAccount('Sign in to save a new copy.')) setDialog('save-new'); }}>Save as new</button>
      <button type="button" className="secondary-action" disabled={busy} onClick={() => { if (requireAccount('Sign in to manage sharing.')) setDialog('share'); }}>Share</button>
    </>}
  </>;

  const status = <>
    <p className="cloud-status" id="cloud-status" role="status">
      {!owned ? <span>{!link ? `Not saved to My Builds${signedIn ? '' : ' · sign in to save'}`
        : !signedIn ? 'Opened from My Builds · sign in to save changes'
          : 'Opened from a build in another account · Save build keeps your own copy'}</span> : <>
        <a href={buildPath(link.buildId)} onClick={event => onLinkClick(event, buildPath(link.buildId))}>In My Builds</a>
        <VisibilityBadge visibility={link.visibility} />
        <span className={state === 'unsaved-changes' ? 'unsaved' : ''}>{state === 'saved' ? 'All changes saved' : 'Unsaved changes'}</span>
      </>}
    </p>
    {conflict && owned && <div className="notice warning cloud-notice" role="alert">
      <p>This build was changed somewhere else (another tab or device) since you opened it. Choose how to continue:</p>
      <div className="notice-actions">
        <button type="button" disabled={busy} onClick={() => setDialog('save-new')}>Save mine as a new build</button>
        <button type="button" disabled={busy} onClick={() => void loadLatest()}>Load the saved version</button>
        <button type="button" disabled={busy} onClick={() => void overwrite()}>Overwrite with mine</button>
      </div>
    </div>}
    {message && <div className={`notice cloud-notice ${message.tone === 'warning' ? 'warning' : 'info'}`} role={message.tone === 'warning' ? 'alert' : 'status'}>
      <p>{message.text}</p>
      <div className="notice-actions">
        {message.retry && <button type="button" disabled={busy} onClick={message.retry}>Retry</button>}
        {message.tone === 'info' && owned && <button type="button" onClick={() => navigate('/my-builds')}>Open My Builds</button>}
        <button type="button" className="notice-dismiss" aria-label="Dismiss message" onClick={() => setMessage(null)}>×</button>
      </div>
    </div>}
    {dialog === 'save-new' && <SaveBuildDialog build={build} asCopy={owned} busy={busy} onClose={() => setDialog(null)}
      onSave={(title, description, visibility) => createNew(title, description, visibility)} />}
    {dialog === 'share' && owned && <ShareDialog target={{ id: link.buildId, revision: link.revision, visibility: link.visibility, title: link.title, publicDescription: link.publicDescription }}
      document={build} unsavedChanges={state === 'unsaved-changes'} onClose={() => setDialog(null)}
      onUpdated={record => onLinkChange(syncLinkMetadata(link, record))} />}
  </>;
  return { actions, status };
}

/** New My Builds record: title, optional public description and visibility (default Private). */
export function SaveBuildDialog({ build, asCopy, busy, onSave, onClose }: {
  build: BuildDocument; asCopy: boolean; busy: boolean;
  onSave: (title: string, description: string, visibility: Visibility) => Promise<void>; onClose: () => void;
}) {
  const [title, setTitle] = useState(build.title);
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = title.trim();
  const titleError = !trimmed ? 'Enter a title.' : [...trimmed].length > BUILD_TITLE_MAX_LENGTH ? `Use at most ${BUILD_TITLE_MAX_LENGTH} characters.` : null;
  const descriptionTooLong = [...description].length > BUILD_PUBLIC_DESCRIPTION_MAX_LENGTH;
  const needsReview = visibility !== 'private' && !reviewed;
  return <Modal titleId="save-build-title" title={asCopy ? 'Save as a new build' : 'Save to My Builds'} onClose={onClose} closeLabel="Close save dialog">
    <form className="account-form" onSubmit={event => {
      event.preventDefault();
      if (titleError || descriptionTooLong || needsReview || busy) return;
      setError(null);
      onSave(trimmed, description, visibility).catch(() => setError('The build was not saved. See the message on the planner, then try again.'));
    }}>
      <p className="dialog-lead">{asCopy ? 'Creates a separate build in My Builds. The original stays unchanged.' : 'Saves a permanent copy to your account. It also stays in this browser.'}</p>
      <label htmlFor="save-title">Title</label>
      <input id="save-title" autoFocus value={title} maxLength={BUILD_TITLE_MAX_LENGTH + 20} aria-invalid={titleError !== null} onChange={event => setTitle(event.target.value)} />
      {titleError && <p className="warning">{titleError}</p>}
      <label htmlFor="save-description">Public description <span className="muted">(optional)</span></label>
      <textarea id="save-description" rows={3} value={description} onChange={event => setDescription(event.target.value)} aria-describedby="save-description-help" />
      <p id="save-description-help" className={descriptionTooLong ? 'warning' : 'muted'}>Shown only if you share the build as Unlisted or Public. Separate from private build notes. {[...description].length}/{BUILD_PUBLIC_DESCRIPTION_MAX_LENGTH}</p>
      <fieldset className="visibility-options"><legend>Visibility</legend>
        {(['private', 'unlisted', 'public'] as const).map(option => <label key={option} className="visibility-option">
          <input type="radio" name="save-visibility" value={option} checked={visibility === option} onChange={() => { setVisibility(option); setReviewed(false); }} />
          <span><strong>{VISIBILITY_LABEL[option]}</strong>{option === 'private' && <span className="muted"> (default)</span>}<span className="option-help">{VISIBILITY_HELP[option]}</span></span>
        </label>)}
      </fieldset>
      {visibility !== 'private' && <>
        <PublicationReview document={build} />
        <label className="review-confirm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I have reviewed what viewers will see</label>
      </>}
      {error && <p className="warning" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" onClick={onClose}>Cancel</button>
        <button type="submit" className="primary-action" disabled={busy || titleError !== null || descriptionTooLong || needsReview}>{busy ? 'Saving…' : 'Save to My Builds'}</button></div>
    </form>
  </Modal>;
}
