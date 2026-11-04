/** Explicit developer opt-in. Production bundles ignore the flag, including production preview. */
export function damageDebugEnabled(development = import.meta.env.DEV, search = globalThis.location?.search ?? ''): boolean {
  return development && new URLSearchParams(search).get('debugDamage') === '1';
}
