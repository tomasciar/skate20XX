import {CHUNK_LENGTH} from './planning/generation.ts';

/** Endless rolling downhill: road and scenery share the streamed height profile. */
export const RAMP = {
  width: 16,
  thickness: 1.0,
  angleDeg: 14,
  chunkLength: CHUNK_LENGTH,
  /** Live chunks ahead of the rider. Fog ends ~300m; keep build past that. */
  chunksAhead: 8,
  /** Extra chunks to finish off-thread before they enter the live window. */
  prepareLead: 3,
  /** Leave room for browser/GPU rendering while filling the three-chunk lead. */
  prepareBudgetMs:1.5,
  /** Keep a little behind so despawn never flashes in the mirror. */
  chunksBehind: 2,
  centerY: 22,
} as const;

