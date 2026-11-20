import {speedFromMph} from '../../units.ts';
export const PUSH_SPEED_LIMIT = speedFromMph(20);
export const PUSH_DURATION = 1.2;
export type PumpState = { active: boolean; phase: number; weight: number; starts: number };

/** Start only at or below the cutoff; a started stroke completes even if speed crosses it. */
export function createPumpCycle() {
  const state: PumpState = { active: false, phase: 0, weight: 0, starts: 0 };
  let elapsed = 0;
  function reset() { Object.assign(state, { active: false, phase: 0, weight: 0, starts: 0 }); elapsed = 0; }
  function update(dt: number, wanted: boolean, speed: number, allowed = true) {
    if (!allowed) { state.active = false; state.weight = 0; return state; }
    if (!state.active) {
      if (!wanted || Math.abs(speed) > PUSH_SPEED_LIMIT) return state;
      elapsed = 0; state.active = true; state.starts++;
    }
    elapsed = Math.min(PUSH_DURATION, elapsed + dt);
    state.phase = elapsed / PUSH_DURATION * Math.PI * 2;
    // Both ends are planted: crossing the threshold never clips a foot stroke.
    state.weight = Math.sin(state.phase / 2) ** 2;
    if (elapsed >= PUSH_DURATION - 1e-9) { state.active = false; state.weight = 0; }
    return state;
  }
  return { state, update, reset };
}
