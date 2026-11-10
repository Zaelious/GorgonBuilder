/**
 * T0020 account session for the whole app. Detects whether this deployment has the T0019
 * backend; when it does not (production, PR previews) every account control stays hidden and
 * the guest planner is unchanged. Never stores tokens: the HttpOnly session cookie is the
 * browser's business, and only the public username reaches React state.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, createAccountApi, describeApiError, type AccountApi, type Provider, type SessionState } from './api';
import { redirectTo } from './browser';
import { Modal } from './Modal';
import { validateUsername, USERNAME_MAX_LENGTH } from '../../persistence/remote/username';

export type AccountState = { kind: 'checking' } | SessionState;

export interface AccountValue {
  state: AccountState;
  api: AccountApi;
  /** Accounts are configured on this deployment (the session may still be guest). */
  enabled: boolean;
  username: string | null;
  refresh: () => Promise<void>;
  requestSignIn: (reason?: string) => void;
  requestUsername: () => void;
  signOut: () => Promise<void>;
  /** Plain-language message for a failed call; a 401 also returns the UI to the guest state. */
  failure: (error: unknown, action?: string) => string;
  notice: { text: string; tone: 'info' | 'warning' } | null;
  setNotice: (notice: AccountValue['notice']) => void;
  /** Called before leaving for the OAuth provider (e.g. flush the local autosave). Return
   * false when work could not be saved; the redirect then waits for an explicit user choice. */
  onBeforeRedirect: (callback: () => boolean) => () => void;
}

const AccountContext = createContext<AccountValue | null>(null);

export function useAccount(): AccountValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount must be used inside AccountProvider.');
  return value;
}

const FOCUS_RECHECK_MS = 60_000;

export function AccountProvider({ children, api: provided }: { children: ReactNode; api?: AccountApi }) {
  const api = useMemo(() => provided ?? createAccountApi(), [provided]);
  const [state, setState] = useState<AccountState>({ kind: 'checking' });
  const [notice, setNotice] = useState<AccountValue['notice']>(null);
  const [dialog, setDialog] = useState<{ kind: 'sign-in'; reason?: string } | { kind: 'username' } | null>(null);
  const redirectCallbacks = useRef(new Set<() => boolean>());
  const lastCheck = useRef(0);
  const promptedUsername = useRef(false);
  const current = useRef<AccountState>(state);
  current.current = state;

  const refresh = useCallback(async () => {
    lastCheck.current = Date.now();
    const next = await api.session();
    // A session that disappears (expiry, sign-out in another tab) returns to guest mode
    // without touching the working build.
    if (current.current.kind === 'user' && next.kind === 'guest') {
      setNotice({ text: 'You are signed out. Your working build is still saved in this browser.', tone: 'info' });
    }
    setState(next);
  }, [api]);

  useEffect(() => {
    void refresh();
    // OAuth failures return here with ?signin=failed (see worker/api/accounts.ts).
    const url = new URL(window.location.href);
    if (url.searchParams.get('signin') === 'failed') {
      setNotice({ text: 'Sign-in was not completed. Your work is unchanged. Try again, or use Google if Discord has no verified email.', tone: 'warning' });
      url.searchParams.delete('signin'); url.searchParams.delete('error');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  }, [refresh]);

  // Detect logout/expiry from other tabs when the user comes back, at most once a minute.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current > FOCUS_RECHECK_MS) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const enabled = state.kind === 'guest' || state.kind === 'user' || state.kind === 'unavailable';
  const username = state.kind === 'user' ? state.username : null;

  // New accounts are asked once per page load; they can postpone, but cannot save until done.
  useEffect(() => {
    if (state.kind === 'user' && state.username === null && !promptedUsername.current) {
      promptedUsername.current = true;
      setDialog({ kind: 'username' });
    }
  }, [state]);

  const failure = useCallback((error: unknown, action?: string) => {
    if (error instanceof ApiError && error.status === 401) setState(current => current.kind === 'user' ? { kind: 'guest' } : current);
    if (error instanceof ApiError && error.code === 'username_required') setState(current => current.kind === 'user' ? { ...current, username: null } : current);
    return describeApiError(error, action);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.signOut();
      setState({ kind: 'guest' });
      setNotice({ text: 'Signed out. Your working build is still saved in this browser.', tone: 'info' });
    } catch (error) {
      setNotice({ text: failure(error, 'sign out'), tone: 'warning' });
      if (error instanceof ApiError && error.status === 401) setState({ kind: 'guest' });
    }
  }, [api, failure]);

  const value = useMemo<AccountValue>(() => ({
    state, api, enabled, username, refresh, failure, notice, setNotice, signOut,
    requestSignIn: reason => setDialog({ kind: 'sign-in', ...(reason ? { reason } : {}) }),
    requestUsername: () => setDialog({ kind: 'username' }),
    onBeforeRedirect: callback => { redirectCallbacks.current.add(callback); return () => { redirectCallbacks.current.delete(callback); }; },
  }), [state, api, enabled, username, refresh, failure, notice, signOut]);

  return <AccountContext.Provider value={value}>
    {children}
    {dialog?.kind === 'sign-in' && <SignInDialog reason={dialog.reason} onClose={() => setDialog(null)}
      prepare={() => [...redirectCallbacks.current].map(callback => callback()).every(Boolean)}
      onStart={async provider => {
        const url = await api.signIn(provider, window.location.pathname + window.location.search);
        redirectTo(url);
      }} />}
    {dialog?.kind === 'username' && <UsernameDialog onClose={() => setDialog(null)} onChoose={async name => {
      const chosen = await api.chooseUsername(name);
      setState({ kind: 'user', username: chosen });
      setNotice({ text: `Welcome, ${chosen}! You can now save builds to My Builds.`, tone: 'info' });
      setDialog(null);
    }} failure={failure} />}
  </AccountContext.Provider>;
}

function SignInDialog({ reason, onClose, onStart, prepare }: {
  reason?: string; onClose: () => void; onStart: (provider: Provider) => Promise<void>; prepare: () => boolean;
}) {
  const [pending, setPending] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState<Provider | null>(null);
  /** Leaving the page must not lose work silently: a failed local save stops here unless the
   * user explicitly chooses to continue without it. */
  async function start(provider: Provider, acceptLoss = false) {
    if (pending) return;
    setError(null);
    if (!acceptLoss && !prepare()) { setUnsaved(provider); return; }
    setUnsaved(null); setPending(provider);
    try { await onStart(provider); } catch (failure) {
      setError(describeApiError(failure, 'start sign-in'));
      setPending(null);
    }
  }
  return <Modal titleId="sign-in-title" title="Sign in to GorgonBuilder" onClose={onClose} closeLabel="Close sign in" className="sign-in-dialog">
    {reason && <p className="dialog-lead">{reason}</p>}
    <div className="provider-buttons">
      <button type="button" className="provider-button" disabled={pending !== null} onClick={() => void start('discord')}>
        {pending === 'discord' ? 'Opening Discord…' : 'Continue with Discord'}</button>
      <button type="button" className="provider-button" disabled={pending !== null} onClick={() => void start('google')}>
        {pending === 'google' ? 'Opening Google…' : 'Continue with Google'}</button>
    </div>
    {unsaved && <div className="notice warning unsaved-before-sign-in" role="alert">
      <p>Your latest changes could not be saved in this browser (storage may be full or blocked). Signing in leaves this page, so those unsaved changes would be lost.</p>
      <div className="notice-actions"><button type="button" onClick={() => void start(unsaved)}>Try saving again</button>
        <button type="button" onClick={() => void start(unsaved, true)}>Sign in anyway and lose unsaved changes</button></div>
    </div>}
    {error && <p className="warning" role="alert">{error}</p>}
    <p className="muted">Planning never requires an account. Signing in lets you save builds to My Builds and share links. Your current work stays saved in this browser while you sign in. New accounts choose a public username next.</p>
  </Modal>;
}

function UsernameDialog({ onClose, onChoose, failure }: { onClose: () => void; onChoose: (name: string) => Promise<void>; failure: AccountValue['failure'] }) {
  const [text, setText] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const check = validateUsername(text);
  function review() {
    if (!check.ok) { setError(check.message); return; }
    setError(null); setConfirming(check.display);
  }
  async function confirm() {
    if (!confirming || pending) return;
    setPending(true); setError(null);
    try { await onChoose(confirming); } catch (failed) {
      setError(failure(failed, 'save your username'));
      setConfirming(null);
    } finally { setPending(false); }
  }
  return <Modal titleId="username-title" title="Choose your public username" onClose={onClose} closeLabel="Choose username later">
    {confirming === null ? <form className="account-form" onSubmit={event => { event.preventDefault(); review(); }}>
      <p className="dialog-lead">Your username is shown as the author of builds you share. It cannot be changed later, so pick one you are happy to keep.</p>
      <label htmlFor="username-input">Username</label>
      <input id="username-input" autoFocus autoComplete="off" spellCheck={false} maxLength={USERNAME_MAX_LENGTH} value={text}
        aria-describedby="username-rules" aria-invalid={error !== null}
        onChange={event => { setText(event.target.value); setError(null); }} />
      <p id="username-rules" className="muted">3–24 letters or numbers; “_” and “-” are allowed inside the name.</p>
      {error && <p className="warning" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" onClick={onClose}>Later</button>
        <button type="submit" className="primary-action">Continue</button></div>
    </form> : <div className="account-form">
      <p className="dialog-lead">Use <strong>{confirming}</strong> as your public username?</p>
      <p className="warning">Usernames cannot currently be changed after you confirm.</p>
      {error && <p className="warning" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" disabled={pending} onClick={() => setConfirming(null)}>Back</button>
        <button type="button" className="primary-action" disabled={pending} onClick={() => void confirm()}>{pending ? 'Saving…' : `Confirm “${confirming}”`}</button></div>
    </div>}
  </Modal>;
}
