import type { ReactNode } from 'react';
import { useAccount } from '../account/AccountContext';
import { navigate } from '../../app/router';

/** Account-only pages: friendly loading, sign-in, username and unavailable states. */
export function AccountGate({ purpose, children }: { purpose: string; children: (username: string) => ReactNode }) {
  const account = useAccount();
  const state = account.state;
  if (state.kind === 'checking') return <p className="notice" role="status">Checking your sign-in…</p>;
  if (state.kind === 'disabled') return <div className="notice"><p>Accounts are not available on this site yet. The planner still works and saves your build in this browser.</p>
    <button type="button" onClick={() => navigate('/')}>Open the planner</button></div>;
  if (state.kind === 'unavailable') return <div className="notice warning" role="alert"><p>The account service is temporarily unavailable. Your planner work is still saved in this browser.</p>
    <button type="button" onClick={() => void account.refresh()}>Retry</button></div>;
  if (state.kind === 'guest') return <div className="notice"><p>Sign in to {purpose}. Planning works without an account.</p>
    <button type="button" className="primary-action" onClick={() => account.requestSignIn(`Sign in to ${purpose}.`)}>Sign in</button></div>;
  if (state.username === null) return <div className="notice"><p>Choose your public username to {purpose}.</p>
    <button type="button" className="primary-action" onClick={account.requestUsername}>Choose username</button></div>;
  return <>{children(state.username)}</>;
}
