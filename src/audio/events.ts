import { LANDING_SPEED } from '../player/movement/speed.ts';

export type RideAudioState = {
  speed: number;
  grounded: boolean;
  grinding: boolean;
  verticalSpeed: number;
  braking: boolean;
  steer: number;
  pumpPhase: number;
  pumpStarts: number;
  trick: string | null;
  bail: boolean;
  resetCount: number;
  ollieCount: number;
};
export type RideSound = 'push' | 'ollie' | 'land' | 'grindOn' | 'grindOff' | 'trick' | 'bail';
export type SoundEvent = { kind: RideSound; strength: number };

/** Observe physics transitions rather than key presses, so sounds match successful actions. */
export function createSoundEvents() {
  let previous: RideAudioState | null = null;
  let fallSpeed = 0, airTime = 0;
  function step(dt: number, state: RideAudioState): SoundEvent[] {
    const old = previous; previous = { ...state };
    if (!old || old.resetCount !== state.resetCount) { fallSpeed = 0; airTime = 0; return []; }
    const sounds: SoundEvent[] = [];
    // Suspension contact and course-relative vertical speed can fluctuate on changing grades.
    // Only a pop actually applied by physics makes an ollie sound, including an ollie off a rail.
    if(state.ollieCount>old.ollieCount && !state.bail) sounds.push({kind:'ollie',strength:0.35});
    if (state.bail && !old.bail) sounds.push({ kind: 'bail', strength: 0.8 });
    if (state.grinding && !old.grinding) sounds.push({ kind: 'grindOn', strength: 0.6 });
    if (!state.grinding && old.grinding) sounds.push({ kind: 'grindOff', strength: 0.35 });
    const supported = state.grounded || state.grinding, wasSupported = old.grounded || old.grinding;
    if (!supported) {
      airTime += dt; fallSpeed = Math.min(fallSpeed, state.verticalSpeed);
    } else {
      // Reject suspension contact chatter, tiny rail corrections, and skims that drop less than the smallest jump.
      if (!wasSupported && !state.grinding && airTime > 0.08 && fallSpeed <= -LANDING_SPEED && !state.bail) {
        sounds.push({ kind: 'land', strength: Math.min(1, 0.2 + Math.abs(fallSpeed) / 14) });
      }
      fallSpeed = 0; airTime = 0;
    }
    const strokeContact = Math.PI * 1.5;
    if (state.pumpPhase >= strokeContact &&
      (old.pumpStarts !== state.pumpStarts || old.pumpPhase < strokeContact) && state.pumpStarts > 0) {
      sounds.push({ kind: 'push', strength: 0.45 });
    }
    if (state.trick && state.trick !== old.trick) sounds.push({ kind: 'trick', strength: 0.35 });
    return sounds;
  }
  return { step, reset() { previous = null; fallSpeed = 0; airTime = 0; } };
}
