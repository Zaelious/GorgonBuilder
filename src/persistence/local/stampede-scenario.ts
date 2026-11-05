import { isValidStampedeStacks } from '../../core/calculation/damage-scenarios';

/** Session scenario only: never saved in BuildDocument or uploaded with builds. */
export const STAMPEDE_STACKS_KEY = 'gorgonbuilder.session.stampede-stacks';
const listeners = new Set<() => void>();

export function readStampedeStacks(): number {
  try {
    const text = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(STAMPEDE_STACKS_KEY);
    const value: unknown = text === null ? 0 : JSON.parse(text);
    return isValidStampedeStacks(value) ? value : 0;
  } catch { return 0; }
}

let fallback: number | null = null;
export const stampedeStacksSnapshot = (): number => fallback ?? readStampedeStacks();

export function writeStampedeStacks(value: number): void {
  if (!isValidStampedeStacks(value)) return;
  try { sessionStorage.setItem(STAMPEDE_STACKS_KEY, JSON.stringify(value)); fallback = null; }
  catch { fallback = value; }
  for (const listener of listeners) listener();
}

export function subscribeStampedeStacks(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const STAMPEDE_STUNNED_KEY = 'gorgonbuilder.session.stampede-while-stunned';
let stunnedFallback: boolean | null = null;
export function readWhileStunned(): boolean {
  try { return sessionStorage.getItem(STAMPEDE_STUNNED_KEY) === 'true'; } catch { return false; }
}
export const whileStunnedSnapshot = (): boolean => stunnedFallback ?? readWhileStunned();
export function writeWhileStunned(value: boolean): void {
  if (typeof value !== 'boolean') return;
  try { sessionStorage.setItem(STAMPEDE_STUNNED_KEY, JSON.stringify(value)); stunnedFallback = null; }
  catch { stunnedFallback = value; }
  for (const listener of listeners) listener();
}
