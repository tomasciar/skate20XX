import type { InputState } from "../input.ts";

export type PlayerIntent = {
  /** 1 push, -1 brake / roll back */
  grabModifier: boolean;
  grabDX: number;
  grabDY: number;
  grabPress?: number;
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

  function update(input: InputState, dt: number): PlayerIntent {
    if (input.crouch || input.crouchPressed) {
      crouchHold = Math.min(1, crouchHold + dt * 3.2);
      ollieArmed = true;
    }

    let wantOllie = false;
    let olliePower = 0;
    if (input.crouchReleased && ollieArmed) {
      wantOllie = true;
      olliePower = Math.max(0.25, crouchHold);
      crouchHold = 0;
      ollieArmed = false;
    }
    if (!input.crouch && !wantOllie) {
      crouchHold = Math.max(0, crouchHold - dt * 3);
    }

    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const push = (input.push ? 1 : 0) - (input.brake ? 1 : 0);

    const intent: PlayerIntent = {
      grabModifier: input.grabModifier,
      grabDX: input.grabDX,
      grabDY: input.grabDY,
      grabPress: input.grabPress,
      push,
      steer,
      crouch: input.crouch,
      crouchHold,
      wantOllie,
      olliePower,
      reset: input.reset,
      flickDX: input.flickDX,
      flickDY: input.flickDY,
      flickReady: input.flickReady && !input.grabModifier,
    };

    // consume one-shot reset
    input.reset = false;

    return intent;
  }

  return { update, reset() { crouchHold = 0; ollieArmed = false; } };
}
