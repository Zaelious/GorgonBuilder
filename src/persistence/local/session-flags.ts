/**
 * Browser-session UI flags (T0014 acceptance). Stored in sessionStorage only: never in BuildDocument v1, never
 * autosaved and never uploaded. Unavailable or blocked storage falls back to the default (off) without throwing.
 */
export const SESSION_FLAG_KEYS = {
  damageAnalysis: 'gorgonbuilder.session.damage-analysis',
  respectSkillLevel: 'gorgonbuilder.session.respect-skill-level',
} as const;

export type SessionFlag = keyof typeof SESSION_FLAG_KEYS;

function storage(): Storage | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
}

export function readSessionFlag(flag: SessionFlag): boolean {
  try { return storage()?.getItem(SESSION_FLAG_KEYS[flag]) === '1'; } catch { return false; }
}

export function writeSessionFlag(flag: SessionFlag, value: boolean): void {
  try {
    const store = storage();
    if (!store) return;
    if (value) store.setItem(SESSION_FLAG_KEYS[flag], '1');
    else store.removeItem(SESSION_FLAG_KEYS[flag]);
  } catch { /* Session-only convenience; the in-page state still applies. */ }
}
