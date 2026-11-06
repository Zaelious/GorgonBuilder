/**
 * Opaque public build IDs: 12 random bytes (96 bits) as 16 base64url characters.
 * Collision-resistant and nonsequential so IDs reveal neither creation order nor
 * build counts. An ID is an address, never an authorization token: Private builds
 * stay owner-only even when their ID is known.
 */
export const BUILD_ID_LENGTH = 16;
const BUILD_ID_BYTES = 12;
const BUILD_ID_PATTERN = /^[A-Za-z0-9_-]{16}$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Fills a byte array; defaults to Web Crypto, available in browsers, Node and Workers. */
export type RandomBytes = (bytes: Uint8Array<ArrayBuffer>) => void;

const cryptoRandom: RandomBytes = bytes => { crypto.getRandomValues(bytes); };

export function generateBuildId(random: RandomBytes = cryptoRandom): string {
  const bytes = new Uint8Array(BUILD_ID_BYTES);
  random(bytes);
  let id = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    id += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + ALPHABET[n & 63]!;
  }
  return id;
}

export function isBuildId(value: unknown): value is string {
  return typeof value === 'string' && BUILD_ID_PATTERN.test(value);
}

/** Deterministic byte source for tests only (mulberry32). Never use for real IDs. */
export function seededRandomBytes(seed: number): RandomBytes {
  let state = seed >>> 0;
  return bytes => {
    for (let i = 0; i < bytes.length; i++) {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      bytes[i] = ((t ^ (t >>> 14)) >>> 0) & 0xff;
    }
  };
}
