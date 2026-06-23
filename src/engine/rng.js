// Deterministic, seedable PRNG (mulberry32). Same seed + same command stream
// => identical simulation on every client. This is the backbone of lockstep
// multiplayer: we never sync game state, only the seed and ordered commands.

export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    // float in [0,1)
    next,
    // int in [min, max]
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    // float in [min, max)
    range: (min, max) => min + next() * (max - min),
    // returns true with probability p
    chance: (p) => next() < p,
    // pick a random element
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    // expose raw state for snapshotting
    state: () => a >>> 0,
    setState: (s) => {
      a = s >>> 0;
    },
  };
}

// Hash a string to a 32-bit seed (used to derive a match seed from a room code).
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
