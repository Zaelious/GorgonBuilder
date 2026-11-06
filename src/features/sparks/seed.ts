/**
 * Fresh reroll seed (16 hex characters) from the browser's cryptographic RNG. Only the *choice* of seed is random;
 * the simulation itself is the pure seeded core engine, so a saved seed always reproduces the same outcomes.
 */
export function createSparkSeed(previous?: string, source: Pick<Crypto, 'getRandomValues'> | undefined = globalThis.crypto): string {
  let seed = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    const words = new Uint32Array(2);
    if (source?.getRandomValues) source.getRandomValues(words);
    else { words[0] = (Date.now() + attempt) >>> 0; words[1] = Math.floor(Math.random() * 2 ** 32) >>> 0; }
    seed = Array.from(words, word => word.toString(16).padStart(8, '0')).join('');
    if (seed !== previous) return seed;
  }
  // A reroll must always change the seed, even with a degenerate random source.
  return `${seed}-${Date.now().toString(16)}`;
}
