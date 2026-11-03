/**
 * Official `OffHand` and `OffHandShield` are distinct item categories (kept exactly in data, imports and saved builds)
 * but one mutually exclusive player loadout position (T0009-F1).
 */
export function isOffhandSlot(slot: string): boolean {
  return slot === 'OffHand' || slot === 'OffHandShield';
}

/**
 * True when two slot strings name the same loadout position. Used only to suppress player-facing "slot differs"
 * warnings whose sole difference is OffHand vs OffHandShield; genuinely different slots still differ.
 */
export function sameLoadoutPosition(a: string, b: string): boolean {
  return a === b || (isOffhandSlot(a) && isOffhandSlot(b));
}
