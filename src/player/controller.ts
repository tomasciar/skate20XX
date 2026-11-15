import type { InputState } from "../input.ts";

export type PlayerIntent = {
  /** 1 push, -1 brake / roll back */
  grabModifier: boolean;
  grabDX: number;
  grabDY: number;
  grabPress?: number;
  groundDX?: number;
  groundDY?: number;
  toggleAirFlip?: boolean;
  push: number;
  steer: number;
  crouch: boolean;
  crouchHold: number;
  wantOllie: boolean;
  olliePower: number;
  reset: boolean;
  flickDX: number;
  flickDY: number;
  flickReady: boolean;
};

export function createController() {
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
      push,
      steer,
      crouch: allowOllie && input.crouch,
      crouchHold,
      wantOllie,
      olliePower,
      reset: input.reset,
      flickDX: input.flickDX,
      flickDY: input.flickDY,
      flickReady: input.flickReady,
    };

    // consume one-shot reset
    input.reset = false;

    return intent;
  }

  return { update, reset() { crouchHold = 0; ollieArmed = airSpaceHeld = false; } };
}
