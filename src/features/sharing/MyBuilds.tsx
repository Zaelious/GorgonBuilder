import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameDataRepository } from '../../data/repository/repository';
import { ApiError, type BuildRecord, type BuildSummary } from '../account/api';
import { useAccount } from '../account/AccountContext';
import { buildPath, navigate, onLinkClick } from '../../app/router';
import { ShareDialog, VisibilityBadge } from './ShareDialog';
import { copyTitle, formatTime, matchesSkills, skillPairLabel, sortBuilds, summarize, type BuildSort } from './format';
import { openRecordInPlanner } from './open-build';
import { readCloudLink, syncLinkMetadata, writeCloudLink } from './workspace';
import { AccountGate } from './AccountGate';

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

/** Signed-in owner's library: every visibility, newest first from the bounded keyset API. */
export function MyBuilds({ data }: { data: GameDataRepository }) {
  return <section className="page-section my-builds" aria-labelledby="my-builds-title">
    <div className="page-heading"><h1 id="my-builds-title">My Builds</h1></div>
    <AccountGate purpose="see and manage your saved builds">
      {username => <Library data={data} username={username} />}
    </AccountGate>
  </section>;
}

function Library({ data, username }: { data: GameDataRepository; username: string }) {
  const account = useAccount();
  const [items, setItems] = useState<BuildSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [sort, setSort] = useState<BuildSort>('updated');
  const [skills, setSkills] = useState<[string, string]>(['', '']);
  const [sharing, setSharing] = useState<BuildSummary | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const busy = useRef(false);
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'warning' } | null>(null);
  const [link, setLink] = useState(readCloudLink);

  const { api, failure } = account;
  const fetchFirst = useCallback(async () => {
    setLoad({ status: 'loading' });
    try {
      const page = await api.listMyBuilds(null);
      setItems(page.items); setCursor(page.nextCursor); setLoad({ status: 'ready' });
    } catch (error) { setLoad({ status: 'error', message: failure(error, 'load your builds') }); }
  }, [api, failure]);
  useEffect(() => { void fetchFirst(); }, [fetchFirst]);

  async function more() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await account.api.listMyBuilds(cursor);
      setItems(previous => [...previous, ...page.items.filter(item => !previous.some(existing => existing.id === item.id))]);
      setCursor(page.nextCursor);
    } catch (error) { setMessage({ tone: 'warning', text: account.failure(error, 'load more builds') }); }
    finally { setLoadingMore(false); }
  }

  async function act(id: string, task: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true; setBusyId(id); setMessage(null);
    try { await task(); } finally { busy.current = false; setBusyId(null); }
  }
  const replace = (record: BuildRecord) => setItems(previous => previous.map(item => item.id === record.id ? summaryOf(record) : item));
  /** Metadata-only changes keep the planner's link revision current (avoids a false conflict). */
  function syncLink(record: BuildRecord) {
    const current = readCloudLink();
    if (current?.buildId !== record.id) return;
    const next = syncLinkMetadata(current, record);
    writeCloudLink(next); setLink(next);
  }

  const open = (summary: BuildSummary) => act(summary.id, async () => {
    try {
      const record = await account.api.getBuild(summary.id);
      const result = openRecordInPlanner(record, username, data.gameDataVersion);
      if (result.status === 'failed') setMessage({ tone: 'warning', text: result.message });
      else if (result.status !== 'cancelled') {
        if (result.status === 'continued') account.setNotice({ tone: 'info', text: `Continuing your unsaved changes to “${record.title}”.` });
        navigate('/');
      }
    } catch (error) { setMessage({ tone: 'warning', text: account.failure(error, 'open the build') }); }
  });

  const duplicate = (summary: BuildSummary) => act(summary.id, async () => {
    try {
      const record = await account.api.copyBuild(summary.id, copyTitle(summary.title));
      setItems(previous => [summaryOf(record), ...previous]);
      setMessage({ tone: 'info', text: `Created “${record.title}” as a separate Private build.` });
    } catch (error) { setMessage({ tone: 'warning', text: account.failure(error, 'duplicate the build') }); }
  });

  const remove = (summary: BuildSummary) => {
    if (!window.confirm(`Delete “${summary.title}” from My Builds? Anyone with its link will lose access. This cannot be undone.`)) return;
    void act(summary.id, async () => {
      try {
        await account.api.deleteBuild(summary.id, summary.revision);
        setItems(previous => previous.filter(item => item.id !== summary.id));
        if (readCloudLink()?.buildId === summary.id) { writeCloudLink(null); setLink(null); }
        setMessage({ tone: 'info', text: `Deleted “${summary.title}”. If it was open in the planner, it stays there as an unsaved local build.` });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          setMessage({ tone: 'warning', text: 'This build changed elsewhere, so it was not deleted. The list was refreshed; check it and try again.' });
          void fetchFirst();
        } else setMessage({ tone: 'warning', text: account.failure(error, 'delete the build') });
      }
    });
  };

  const skillOptions = useMemo(() => [...new Set(items.flatMap(item => [item.skillAId, item.skillBId]).filter((id): id is string => id !== null))]
    .map(id => ({ id, name: data.getSkill(id)?.name ?? id })).sort((a, b) => a.name.localeCompare(b.name)), [items, data]);
  const visible = useMemo(() => sortBuilds(items.filter(item => matchesSkills(item, skills)), sort), [items, skills, sort]);
  const filtering = skills.some(Boolean);

  if (load.status === 'loading') return <p className="notice" role="status">Loading your builds…</p>;
  if (load.status === 'error') return <div className="notice warning" role="alert"><p>{load.message}</p><button type="button" onClick={() => void fetchFirst()}>Retry</button></div>;
  return <>
    {message && <div className={`notice cloud-notice ${message.tone}`} role={message.tone === 'warning' ? 'alert' : 'status'}><p>{message.text}</p>
      <button type="button" className="notice-dismiss" aria-label="Dismiss message" onClick={() => setMessage(null)}>×</button></div>}
    {items.length === 0 ? <div className="empty-state"><p>No saved builds yet. In the planner, choose <strong>Save build</strong> to keep a build in your account.</p>
      <button type="button" onClick={() => navigate('/')}>Go to the planner</button></div> : <>
      <div className="library-controls">
        <label>Sort<select value={sort} onChange={event => setSort(event.target.value as BuildSort)} aria-label="Sort builds">
          <option value="updated">Recently updated</option><option value="created">Newest created</option><option value="name">Name A–Z</option>
        </select></label>
        {[0, 1].map(index => <label key={index}>{index === 0 ? 'Skill' : 'And skill'}<select value={skills[index]} aria-label={index === 0 ? 'Filter by combat skill' : 'Filter by second combat skill'}
          onChange={event => setSkills(previous => (index === 0 ? [event.target.value, previous[1]] : [previous[0], event.target.value]))}>
          <option value="">Any</option>{skillOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select></label>)}
        <p className="muted library-count" aria-live="polite">{filtering ? `${visible.length} of ${items.length}` : `${items.length}`} loaded build{items.length === 1 ? '' : 's'}{cursor ? ' · more available' : ''}</p>
      </div>
      {visible.length === 0 ? <p className="empty-state">No loaded builds use {filtering ? 'those skills' : 'this filter'}.{cursor ? ' Load more builds to search further.' : ''}</p> :
        <ul className="build-list">{visible.map(item => <li key={item.id} className="build-row" aria-busy={busyId === item.id}>
          <div className="build-row-main">
            <p className="build-row-heading"><a className="build-row-title" href={buildPath(item.id)} onClick={event => onLinkClick(event, buildPath(item.id))}>{item.title}</a>
              <VisibilityBadge visibility={item.visibility} />{link?.buildId === item.id && <span className="in-planner">In planner</span>}</p>
            <p className="build-row-meta">{skillPairLabel(item, data)} · Updated {formatTime(item.updatedAt)}</p>
            {item.publicDescription.trim() && <p className="build-row-description">{summarize(item.publicDescription)}</p>}
          </div>
          <div className="build-row-actions">
            <button type="button" className="primary-action" disabled={busyId !== null} onClick={() => void open(item)} aria-label={`Open ${item.title} in the planner`}>Open</button>
            <button type="button" disabled={busyId !== null} onClick={() => setSharing(item)} aria-label={`Share ${item.title}`}>Share</button>
            <button type="button" disabled={busyId !== null} onClick={() => void duplicate(item)} aria-label={`Duplicate ${item.title}`}>Duplicate</button>
            <button type="button" className="danger-action" disabled={busyId !== null} onClick={() => remove(item)} aria-label={`Delete ${item.title}`}>Delete</button>
          </div>
        </li>)}</ul>}
      {cursor && <button type="button" className="load-more" disabled={loadingMore} onClick={() => void more()}>{loadingMore ? 'Loading…' : 'Load more builds'}</button>}
    </>}
    {sharing && <ShareDialog target={sharing} onClose={() => setSharing(null)} onUpdated={record => { replace(record); syncLink(record); setSharing(summaryOf(record)); }} />}
  </>;
}

export function summaryOf(record: BuildRecord): BuildSummary {
  return { id: record.id, visibility: record.visibility, title: record.title, publicDescription: record.publicDescription,
    skillAId: record.skillAId, skillBId: record.skillBId, schemaVersion: record.schemaVersion, gameDataVersion: record.gameDataVersion,
    revision: record.revision, createdAt: record.createdAt, updatedAt: record.updatedAt, author: record.author };
}
