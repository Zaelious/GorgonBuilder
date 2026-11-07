import { useCallback, useEffect, useState } from 'react';
import type { GameDataRepository } from '../../data/repository/repository';
import { ApiError, type BuildSummary } from '../account/api';
import { useAccount } from '../account/AccountContext';
import { authorPath, buildPath, navigate, onLinkClick } from '../../app/router';
import { AccountGate } from './AccountGate';
import { formatTime, skillPairLabel, summarize } from './format';

/** `/profile`: the signed-in account (username, public profile, sign out). */
export function ProfilePage({ data }: { data: GameDataRepository }) {
  const account = useAccount();
  return <section className="page-section" aria-labelledby="profile-title">
    <div className="page-heading"><h1 id="profile-title">Profile</h1></div>
    <AccountGate purpose="see your profile">{username => <>
      <div className="profile-card">
        <p>Signed in as <strong>{username}</strong></p>
        <p className="muted">Your username is your public author name. It cannot currently be changed.</p>
        <div className="notice-actions">
          <a className="button-link" href={authorPath(username)} onClick={event => onLinkClick(event, authorPath(username))}>View public profile</a>
          <a className="button-link" href="/my-builds" onClick={event => onLinkClick(event, '/my-builds')}>My Builds</a>
          <button type="button" className="sign-out" onClick={() => void account.signOut().then(() => navigate('/'))}>Sign out</button>
        </div>
      </div>
      <h2 className="subheading">Your public builds</h2>
      <p className="muted">Only Public builds appear here and on your public profile. Private and Unlisted builds are listed only in My Builds.</p>
      <PublicBuildList username={username} data={data} />
    </>}</AccountGate>
  </section>;
}

/** `/u/:username`: anyone's Public builds only (T0019 public-only author list). */
export function AuthorPage({ username, data }: { username: string; data: GameDataRepository }) {
  const account = useAccount();
  const mine = account.username !== null && account.username.toLowerCase() === username.toLowerCase();
  if (account.state.kind === 'checking') return <p className="notice" role="status">Loading profile…</p>;
  if (!account.enabled) return <div className="notice"><h1>Profiles are not available here</h1><p>This site does not have accounts yet.</p>
    <button type="button" onClick={() => navigate('/')}>Open the planner</button></div>;
  return <section className="page-section" aria-labelledby="author-title">
    <div className="page-heading"><h1 id="author-title">Builds by {username}</h1></div>
    {mine && <p className="muted">This is your public profile as others see it. Private and Unlisted builds are only in My Builds.</p>}
    <PublicBuildList username={username} data={data} />
  </section>;
}

function PublicBuildList({ username, data }: { username: string; data: GameDataRepository }) {
  const account = useAccount();
  const [items, setItems] = useState<BuildSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | { error: string }>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const { api, failure } = account;
  const load = useCallback(async (from: string | null) => {
    if (from === null) setState('loading'); else setLoadingMore(true);
    try {
      const page = await api.listAuthorBuilds(username, from);
      setItems(previous => from === null ? page.items : [...previous, ...page.items]);
      setCursor(page.nextCursor); setState('ready');
    } catch (error) {
      if (from !== null) setState({ error: failure(error, 'load more builds') });
      else setState(error instanceof ApiError && error.status === 404 ? 'missing' : { error: failure(error, 'load public builds') });
    } finally { setLoadingMore(false); }
  }, [api, failure, username]);
  useEffect(() => { void load(null); }, [load]);
  if (state === 'loading') return <p className="notice" role="status">Loading builds…</p>;
  if (state === 'missing') return <p className="notice">No author uses this username.</p>;
  if (typeof state === 'object' && !items.length) return <div className="notice warning" role="alert"><p>{state.error}</p><button type="button" onClick={() => void load(null)}>Retry</button></div>;
  return <>
    {items.length === 0 ? <p className="empty-state">No public builds yet.</p> : <ul className="build-list">{items.map(item => <li key={item.id} className="build-row">
      <div className="build-row-main">
        <p className="build-row-heading"><a className="build-row-title" href={buildPath(item.id)} onClick={event => onLinkClick(event, buildPath(item.id))}>{item.title}</a></p>
        <p className="build-row-meta">{skillPairLabel(item, data)} · Updated {formatTime(item.updatedAt)}</p>
        {item.publicDescription.trim() && <p className="build-row-description">{summarize(item.publicDescription)}</p>}
      </div>
    </li>)}</ul>}
    {typeof state === 'object' && <p className="warning" role="alert">{state.error}</p>}
    {cursor && <button type="button" className="load-more" disabled={loadingMore} onClick={() => void load(cursor)}>{loadingMore ? 'Loading…' : 'Load more builds'}</button>}
  </>;
}
