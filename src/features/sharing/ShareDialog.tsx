import { useState } from 'react';
import type { BuildDocument } from '../../core/build/document';
import { ApiError, type BuildRecord, type Visibility } from '../account/api';
import { useAccount } from '../account/AccountContext';
import { Modal } from '../account/Modal';
import { buildPath } from '../../app/router';
import { BUILD_PUBLIC_DESCRIPTION_MAX_LENGTH } from '../../persistence/remote/build-record';

export const VISIBILITY_LABEL: Record<Visibility, string> = { private: 'Private', unlisted: 'Unlisted', public: 'Public' };
export const VISIBILITY_HELP: Record<Visibility, string> = {
  private: 'Only you, while signed in. The link does not work for anyone else.',
  unlisted: 'Anyone with the link can view it read-only. It is not shown on your profile or in search.',
  public: 'Anyone with the link can view it read-only, and it is listed on your public profile. The Search Builds directory arrives in the next update; Public builds will be findable there once it launches.',
};

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  return <span className={`visibility-badge visibility-${visibility}`}>{VISIBILITY_LABEL[visibility]}</span>;
}

export function shareUrl(id: string): string {
  return `${window.location.origin}${buildPath(id)}`;
}

/** What a non-owner can see (mirrors src/persistence/remote/public-document.ts). */
export function PublicationReview({ document }: { document?: BuildDocument }) {
  const importedItems = document?.equipment.filter(selection => selection.item.kind === 'imported').length ?? 0;
  const hasNotes = !!document?.notes.trim();
  const hasImport = !!document?.characterImport;
  return <div className="publication-review" aria-label="What viewers will see">
    <div><h3>Visible to viewers</h3><ul>
      <li>Title, public description and your username</li>
      <li>Skills, levels and both ability bars</li>
      <li>Equipment, item powers{importedItems ? ` (including ${importedItems} imported item${importedItems === 1 ? '' : 's'})` : ''}, planned mods and Mastery Sparks</li>
      <li>Target dummy settings</li>
    </ul></div>
    <div><h3>Never shared</h3><ul>
      <li>Your CharacterSheet/Storage files (they never leave this browser)</li>
      <li>{hasImport ? 'Character name, server and import details' : 'Character and import details'}</li>
      <li>Imported item names, IDs and source details</li>
      <li>{hasNotes ? 'Your private build notes' : 'Private build notes'}, sign-in details and email</li>
    </ul></div>
  </div>;
}

export interface ShareTarget { id: string; revision: number; visibility: Visibility; title: string; publicDescription: string }

/**
 * Visibility, public description and the share link for one owned build. Making a Private build
 * Unlisted/Public requires reviewing what becomes visible. Saves only listing metadata; the
 * build document itself is unchanged.
 */
export function ShareDialog({ target, document, unsavedChanges = false, onUpdated, onClose }: {
  target: ShareTarget; document?: BuildDocument; unsavedChanges?: boolean;
  onUpdated: (record: BuildRecord) => void; onClose: () => void;
}) {
  const account = useAccount();
  const [current, setCurrent] = useState(target);
  const [visibility, setVisibility] = useState<Visibility>(target.visibility);
  const [description, setDescription] = useState(target.publicDescription);
  const [reviewed, setReviewed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'warning' } | null>(null);
  const [copied, setCopied] = useState(false);
  const publishing = current.visibility === 'private' && visibility !== 'private';
  const changed = visibility !== current.visibility || description !== current.publicDescription;
  const tooLong = [...description].length > BUILD_PUBLIC_DESCRIPTION_MAX_LENGTH;
  const url = shareUrl(current.id);

  async function save() {
    if (pending || !changed || tooLong || (publishing && !reviewed)) return;
    setPending(true); setMessage(null);
    try {
      const record = await account.api.updateBuild(current.id, { expectedRevision: current.revision, visibility, publicDescription: description });
      setCurrent({ id: record.id, revision: record.revision, visibility: record.visibility, title: record.title, publicDescription: record.publicDescription });
      setReviewed(false);
      onUpdated(record);
      setMessage({ tone: 'info', text: record.visibility === 'private' ? 'Saved. This build is Private: shared links no longer work for anyone else.'
        : `Saved. This build is ${VISIBILITY_LABEL[record.visibility]}; copy the link below to share it.` });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try {
          const latest = await account.api.getBuild(current.id);
          setCurrent({ id: latest.id, revision: latest.revision, visibility: latest.visibility, title: latest.title, publicDescription: latest.publicDescription });
          onUpdated(latest);
          setMessage({ tone: 'warning', text: 'This build was changed elsewhere. The latest version is loaded; review your choices and save again.' });
        } catch (reload) { setMessage({ tone: 'warning', text: account.failure(reload, 'reload the build') }); }
      } else setMessage({ tone: 'warning', text: account.failure(error, 'update sharing') });
    } finally { setPending(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch {
      setMessage({ tone: 'warning', text: 'Copying is blocked in this browser. Select the link and copy it manually.' });
    }
  }

  return <Modal titleId="share-title" title={`Share “${current.title}”`} onClose={onClose} closeLabel="Close sharing" className="share-dialog">
    <form className="account-form" onSubmit={event => { event.preventDefault(); void save(); }}>
      {unsavedChanges && <p className="warning">Viewers see the last saved version. Use Save changes first to share your latest edits.</p>}
      <fieldset className="visibility-options" disabled={pending}><legend>Who can view this build?</legend>
        {(['private', 'unlisted', 'public'] as const).map(option => <label key={option} className="visibility-option">
          <input type="radio" name="visibility" value={option} checked={visibility === option} onChange={() => { setVisibility(option); setReviewed(false); }} />
          <span><strong>{VISIBILITY_LABEL[option]}</strong>{option === current.visibility && <span className="muted"> (current)</span>}<span className="option-help">{VISIBILITY_HELP[option]}</span></span>
        </label>)}
      </fieldset>
      <label htmlFor="share-description">Public description <span className="muted">(optional)</span></label>
      <textarea id="share-description" rows={3} value={description} disabled={pending} aria-describedby="share-description-help"
        onChange={event => setDescription(event.target.value)} />
      <p id="share-description-help" className={tooLong ? 'warning' : 'muted'}>Shown with the build when it is Unlisted or Public. {[...description].length}/{BUILD_PUBLIC_DESCRIPTION_MAX_LENGTH}</p>
      {publishing && <>
        <PublicationReview document={document} />
        <label className="review-confirm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />
          I have reviewed what viewers will see</label>
      </>}
      {message && <p className={message.tone === 'warning' ? 'warning' : 'success-text'} role={message.tone === 'warning' ? 'alert' : 'status'}>{message.text}</p>}
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>Done</button>
        <button type="submit" className="primary-action" disabled={pending || !changed || tooLong || (publishing && !reviewed)}>
          {pending ? 'Saving…' : 'Save sharing settings'}</button>
      </div>
    </form>
    {current.visibility !== 'private' ? <div className="share-link">
      <label htmlFor="share-link-input">Share link ({VISIBILITY_LABEL[current.visibility]})</label>
      <div className="share-link-row"><input id="share-link-input" readOnly value={url} onFocus={event => event.currentTarget.select()} />
        <button type="button" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy link'}</button></div>
    </div> : <p className="muted share-link-hint">Choose Unlisted or Public and save to get a share link.</p>}
  </Modal>;
}
