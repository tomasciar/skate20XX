/** Pure, reproducible layout rules. Every encounter leaves a 4.4 m clear corridor. */
export const CHUNK_LENGTH = 70;
export type District = 'grove' | 'village' | 'ridge';
export type Encounter = { kind: 'kicker' | 'pad' | 'cones' | 'rail'; x: number; along: number; width: number; length: number; height: number };
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function planChunk(index: number, seed = 0x9e3779b9) {
  const rng = seededRandom(Math.imul(index, 2654435761) ^ seed);
  const district: District = (['grove', 'village', 'ridge'] as const)[Math.floor(index / 4) % 3]!;
  const encounters: Encounter[] = [];
  if (index > 0) {
    for (const along of [22, 52]) {
      const kind = (['kicker', 'pad', 'cones', 'rail'] as const)[Math.floor(rng() * 4)]!;
      encounters.push({ kind, x: (rng() < 0.5 ? -1 : 1) * 4.9,
        along: along + (rng() - 0.5) * 2, width: 3 + rng() * 0.8,
        length: kind === 'kicker' ? 8 + rng() * 2 : kind === 'pad' ? 6 : kind === 'rail' ? 16 : 4,
        height: kind === 'kicker' ? 1.2 + rng() * 0.5 : kind === 'rail' ? 0.75 : 0.32 });
    }
  }
  // Longer dedicated rail sections give room to balance even as the run gets faster.
  if (index > 0 && index % 4 === 3) {
    encounters.splice(0, encounters.length, { kind: 'rail', x: index % 8 === 3 ? -4.9 : 4.9,
      along: 35, width: 0.7, length: 48, height: 0.75 });
  }
  return { district, encounters };
}
