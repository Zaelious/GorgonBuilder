/**
 * Deterministic seeded RNG for Spark simulation (model skill-damage-sparks-v1). Pure, browser-independent and never
 * uses Math.random(). Algorithms are the widely published public-domain cyrb128 string hash and sfc32 generator
 * (Chris Doty-Humphrey's Small Fast Counter), both 32-bit integer only, so results are identical in every JS engine.
 */

/** cyrb128: hashes a seed string (UTF-16 code units) to four 32-bit words. */
export function hashSeed(seed: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Number of initial sfc32 outputs discarded so similar seeds diverge before the first roll. */
export const RNG_WARMUP = 15;

/** sfc32 seeded from `hashSeed(seed)`. Returns a generator of unsigned 32-bit integers. */
export function createSeededUint32(seed: string): () => number {
  let [a, b, c, d] = hashSeed(seed);
  const next = () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < RNG_WARMUP; i++) next();
  return next;
}

const UINT32_RANGE = 2 ** 32;

/** Exactly uniform integer in [0, bound) by rejection sampling (no modulo bias). bound: 1..2^32. */
export function uniformInt(next: () => number, bound: number): number {
  if (!Number.isSafeInteger(bound) || bound < 1 || bound > UINT32_RANGE) throw new RangeError('bound must be an integer in 1..2^32');
  const limit = UINT32_RANGE - (UINT32_RANGE % bound);
  for (;;) {
    const value = next();
    if (value < limit) return value % bound;
  }
}
