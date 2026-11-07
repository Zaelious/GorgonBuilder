import { useEffect, useRef, useState } from 'react';
import { useAccount } from './AccountContext';
import { navigate, onLinkClick, parseRoute, useLocation, type Route } from '../../app/router';

/**
 * Compact app navigation (T0020). Rendered only where the account backend exists, so
 * production and PR previews keep the unchanged guest planner without dead links.
 * Search Builds is deliberately absent until T0020-F1 implements it.
 */
export function AppNav() {
  const account = useAccount();
  const location = useLocation();
  if (!account.enabled) return null;
  const route = parseRoute(location.split('?')[0]!);
  const signedIn = account.state.kind === 'user';
  const item = (to: string, label: string, active: (route: Route) => boolean, className = '') =>
    <a href={to} className={className} aria-current={active(route) ? 'page' : undefined} onClick={event => onLinkClick(event, to)}>{label}</a>;
  return <nav className="app-nav" aria-label="Main">
    <div className="app-nav-inner">
      <div className="app-nav-links">
        {item('/', 'Planner', r => r.name === 'planner')}
        {item('/my-builds', 'My Builds', r => r.name === 'my-builds')}
        {signedIn && account.username && item('/profile', 'Profile', r => r.name === 'profile' || (r.name === 'author' && r.username.toLowerCase() === account.username!.toLowerCase()), 'nav-profile')}
      </div>
      <div className="account-control">
        {account.state.kind === 'unavailable' && <button type="button" className="nav-button" onClick={() => void account.refresh()} title="The account service did not respond. Planning still works.">Accounts offline · Retry</button>}
        {account.state.kind === 'guest' && <button type="button" className="nav-button sign-in-button" onClick={() => account.requestSignIn()}>Sign in</button>}
        {signedIn && account.username === null && <button type="button" className="nav-button sign-in-button" onClick={account.requestUsername}>Choose username</button>}
        {signedIn && <AccountMenu username={account.username} onSignOut={() => void account.signOut()} />}
      </div>
    </div>
  </nav>;
}

function AccountMenu({ username, onSignOut }: { username: string | null; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const choose = (action: () => void) => { setOpen(false); action(); };
  return <div className="account-menu" ref={root} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); button.current?.focus(); }
  }}>
    <button ref={button} type="button" className="nav-button account-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span className="account-avatar" aria-hidden="true">{(username ?? '?').slice(0, 1).toUpperCase()}</span>
      <span className="account-name">{username ?? 'New account'}</span>
      <span className="visually-hidden">account menu</span>
    </button>
    {open && <div className="account-menu-list" role="menu">
      <p className="account-menu-label">Signed in{username ? <> as <strong>{username}</strong></> : ''}</p>
      {username && <button type="button" role="menuitem" autoFocus onClick={() => choose(() => navigate('/profile'))}>Profile</button>}
      <button type="button" role="menuitem" autoFocus={!username} onClick={() => choose(() => navigate('/my-builds'))}>My Builds</button>
      <button type="button" role="menuitem" className="sign-out" onClick={() => choose(onSignOut)}>Sign out</button>
    </div>}
  </div>;
}
