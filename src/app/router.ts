/** T0020 minimal History API router: no dependency, same SPA deep-link fallback as before. */
import { useSyncExternalStore, type MouseEvent } from 'react';

export type Route =
  | { name: 'planner' }
  | { name: 'my-builds' }
  | { name: 'profile' }
  | { name: 'author'; username: string }
  | { name: 'build'; id: string }
  | { name: 'not-found' };

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { name: 'planner' };
  if (path === '/my-builds') return { name: 'my-builds' };
  if (path === '/profile') return { name: 'profile' };
  const build = /^\/builds\/([A-Za-z0-9_-]{16})$/.exec(path);
  if (build) return { name: 'build', id: build[1]! };
  const author = /^\/u\/([^/]+)$/.exec(path);
  if (author) {
    try { return { name: 'author', username: decodeURIComponent(author[1]!) }; } catch { return { name: 'not-found' }; }
  }
  return { name: 'not-found' };
}

export const buildPath = (id: string) => `/builds/${id}`;
export const authorPath = (username: string) => `/u/${encodeURIComponent(username)}`;

const CHANGE = 'gorgonbuilder:navigate';
function subscribe(listener: () => void) {
  window.addEventListener('popstate', listener);
  window.addEventListener(CHANGE, listener);
  return () => { window.removeEventListener('popstate', listener); window.removeEventListener(CHANGE, listener); };
}
const snapshot = () => window.location.pathname + window.location.search;

/** Current path + query; re-renders on navigate() and browser back/forward. */
export function useLocation(): string {
  return useSyncExternalStore(subscribe, snapshot, () => '/');
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (to === snapshot()) return;
  if (options.replace) window.history.replaceState(null, '', to); else window.history.pushState(null, '', to);
  window.dispatchEvent(new Event(CHANGE));
  if (!options.replace && !navigator.userAgent.includes('jsdom')) window.scrollTo({ top: 0 });
}

/** Ordinary links stay real <a href> elements (open in new tab, copy link); plain clicks route in-app. */
export function onLinkClick(event: MouseEvent<HTMLAnchorElement>, to: string): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(to);
}
