import type { InputState } from "../input.ts";
import {clampSensitivity} from './movement/sensitivity.ts';
import type {SensitivitySettings} from './movement/sensitivity.ts';

export type PlayerIntent = {
  grabModifier: boolean;
  grabDX: number;
  grabDY: number;
  grabPress?: number;
  groundDX?: number;
  groundDY?: number;
  toggleAirFlip?: boolean;
  wantSlide?: boolean;
  /** 1 push, -1 slide; controls pitch while aerial flip mode is active. */
  push: number;
  steer: number;
  /** Independent rotation rates; movement forces and input directions remain normalized. */
  carveSensitivity?:number;
  flipSensitivity?:number;
  turnSensitivity?:number;
  crouch: boolean;
  crouchHold: number;
  wantOllie: boolean;
  olliePower: number;
  reset: boolean;
  flickDX: number;
  flickDY: number;
  flickReady: boolean;
  /** Trick direction still held (Shift + arrows); keeps the current board trick spinning. */
  flickHoldDX?: number;
  flickHoldDY?: number;
};

export function createController() {
  let sensitivity:SensitivitySettings={carve:1,flip:1,turn:1};
  let crouchHold = 0;
  let ollieArmed = false;
  let airSpaceHeld = false;

  function update(input: InputState, dt: number, airborne = false, canOllie = !airborne): PlayerIntent {
    const toggleAirFlip=airborne && !canOllie && input.crouchPressed;
    if(airborne && !canOllie) {
      airSpaceHeld ||= input.crouch || input.crouchPressed;
      crouchHold=0;ollieArmed=false;
    }
    const allowOllie=canOllie && !airSpaceHeld;
    if (allowOllie && (input.crouch || input.crouchPressed)) {
      crouchHold = Math.min(1, crouchHold + dt * 3.2);
      ollieArmed = true;
    }

    let wantOllie = false;
    let olliePower = 0;
    if (allowOllie && input.crouchReleased && ollieArmed) {
      wantOllie = true;
      olliePower = Math.max(0.25, crouchHold);
      crouchHold = 0;
      ollieArmed = false;
    }
    if (!input.crouch && !wantOllie) {
      crouchHold = Math.max(0, crouchHold - dt * 3);
    }
    if(!input.crouch)airSpaceHeld=false;

    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const push = (input.push ? 1 : 0) - (input.brake ? 1 : 0);

    const intent: PlayerIntent = {
      grabModifier: !input.trickModifier && !input.flickReady,
      grabDX: input.grabDX,
      grabDY: input.grabDY,
      grabPress: input.grabPress,
      groundDX: input.trickModifier ? 0 : input.arrowDX ?? 0,
      groundDY: input.trickModifier ? 0 : input.arrowDY ?? 0,
      toggleAirFlip,
      wantSlide: input.brake,
      push,
      steer,
      carveSensitivity:sensitivity.carve,flipSensitivity:sensitivity.flip,turnSensitivity:sensitivity.turn,
      crouch: allowOllie && input.crouch,
      crouchHold,
      wantOllie,
      olliePower,
      reset: input.reset,
      flickDX: input.flickDX,
      flickDY: input.flickDY,
      flickReady: input.flickReady,
      flickHoldDX: input.trickModifier ? input.arrowDX ?? 0 : 0,
      flickHoldDY: input.trickModifier ? input.arrowDY ?? 0 : 0,
    };

    // consume one-shot reset
    input.reset = false;

    return intent;
  }

  return { update,setSensitivities(values:SensitivitySettings){sensitivity={carve:clampSensitivity(values.carve),flip:clampSensitivity(values.flip),turn:clampSensitivity(values.turn)};},
    reset() { crouchHold = 0; ollieArmed = airSpaceHeld = false; } };
}
