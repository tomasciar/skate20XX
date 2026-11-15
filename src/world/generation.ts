/** Pure, reproducible layout rules. Every encounter leaves a 4.4 m clear corridor. */
export const CHUNK_LENGTH = 70;
export const DISTRICTS = ['grove', 'village', 'ridge', 'farm', 'mill'] as const;
export type District = (typeof DISTRICTS)[number];
export const DISTRICT_NAMES: Record<District, string> = {
  grove: 'CEDAR GROVE', village: 'OLD TOWN', ridge: 'SUMMIT RIDGE', farm: 'GOLDEN ACRES', mill: 'TIMBER MILL',
};
export const ENCOUNTER_KINDS = ['kicker', 'cones', 'rail', 'ledge'] as const;
export type Encounter = { kind: (typeof ENCOUNTER_KINDS)[number]; x: number; along: number; width: number; length: number; height: number };
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Districts come in runs of varying length. Each block of chunks holds three runs, so any index resolves directly. */
const BLOCK = 13;
type Block = { districts: District[]; starts: number[] };
const blocks = new Map<number, Block>();
function shuffled(block: number) {
  const rng = seededRandom(Math.imul(block, 0x85ebca6b) ^ 0x51ed27f3), order = [...DISTRICTS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j]!, order[i]!];
  }
  // The run always opens in the grove.
  if (block === 0) { const at = order.indexOf('grove'); [order[0], order[at]] = [order[at]!, order[0]!]; }
  // Run lengths of 3 to 7 chunks (210 to 490 m).
  const first = 3 + Math.floor(rng() * 4), second = 3 + Math.floor(rng() * Math.min(4, BLOCK - first - 5));
  return { order, starts: [0, first, first + second] };
}
function blockAt(block: number): Block {
  let cached = blocks.get(block);
  if (!cached) {
    const { order, starts } = shuffled(block), districts = order.slice(0, 3);
    // Never repeat a district across a block boundary.
    if (block !== 0 && districts[0] === shuffled(block - 1).order[2]) districts[0] = order[3]!;
    cached = { districts, starts };
    blocks.set(block, cached);
    if (blocks.size > 64) blocks.delete(blocks.keys().next().value!);
  }
  return cached;
}
/** The district at a chunk, where its run began, and how many chunks into the run this is. */
export function districtAt(index: number): { district: District; start: number; offset: number } {
  const block = Math.floor(index / BLOCK), local = index - block * BLOCK, { districts, starts } = blockAt(block);
  const run = local >= starts[2]! ? 2 : local >= starts[1]! ? 1 : 0;
  return { district: districts[run]!, start: block * BLOCK + starts[run]!, offset: local - starts[run]! };
}

export function planChunk(index: number, seed = 0x9e3779b9) {
  const rng = seededRandom(Math.imul(index, 2654435761) ^ seed);
  const { district, offset } = districtAt(index);
  const encounters: Encounter[] = [];
  if (index > 0) {
    for (const along of [22, 52]) {
      const kind = ENCOUNTER_KINDS[Math.floor(rng() * ENCOUNTER_KINDS.length)]!;
      const grindable = kind === 'rail' || kind === 'ledge';
      encounters.push({ kind, x: (rng() < 0.5 ? -1 : 1) * 4.9,
        along: along + (rng() - 0.5) * 2, width: grindable ? 0.7 : 3 + rng() * 0.8,
        length: kind === 'kicker' ? 8 + rng() * 2 : kind === 'rail' ? 16 : kind === 'ledge' ? 12 : 4,
        height: kind === 'kicker' ? 1.2 + rng() * 0.5 : kind === 'rail' ? 0.75 : kind === 'ledge' ? 0.45 : 0.32 });
    }
  }
  // Longer dedicated rail sections give room to balance even as the run gets faster.
  if (index > 0 && index % 4 === 3) {
    encounters.splice(0, encounters.length, { kind: 'rail', x: index % 8 === 3 ? -4.9 : 4.9,
      along: 35, width: 0.7, length: 48, height: 0.75 });
  }
  return { district, entering: offset === 0, encounters };
}
