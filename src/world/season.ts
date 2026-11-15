import type {RideMode} from '../mode.ts';

/** Appearance is independent of environment selection and physics. */
export type WorldSeason = 'summer' | 'winter';

/** The existing mode buttons choose these defaults; environment builders never need to know. */
export function seasonForRideMode(mode:RideMode):WorldSeason {
  return mode==='snowboard'?'winter':'summer';
}
