import { classifyGrab } from "./grabs.ts";
import type { GrabDef } from "./grabs.ts";
export type TrickId =
  | "kickflip"
  | "heelflip"
  | "shoveit"
  | "fs180"
  | "varial"
  | "hardflip";

export type TrickDef = {
  id: TrickId;
  name: string;
  /** Board spin in local axes (radians total) */
  spinX: number;
  spinY: number;
  spinZ: number;
  duration: number;
};

const TRICKS: TrickDef[] = [
  { id: "shoveit", name: "Pop Shove-It", spinX: 0, spinY: Math.PI, spinZ: 0, duration: 0.42 },
  { id: "kickflip", name: "Kickflip", spinX: 0, spinY: 0, spinZ: -Math.PI * 2, duration: 0.45 },
  { id: "heelflip", name: "Heelflip", spinX: 0, spinY: 0, spinZ: Math.PI * 2, duration: 0.45 },
  { id: "fs180", name: "FS 180", spinX: 0, spinY: Math.PI, spinZ: 0, duration: 0.42 },
  { id: "varial", name: "Varial Flip", spinX: 0, spinY: Math.PI, spinZ: -Math.PI * 2, duration: 0.5 },
  { id: "hardflip", name: "Hardflip", spinX: 0, spinY: -Math.PI, spinZ: -Math.PI * 2, duration: 0.5 },
];

export type TrickState = {
  grab: GrabDef | null;
  grabTime: number;
  active: TrickDef | null;
  t: number;
  boardSpin: { x: number; y: number; z: number };
  lastLanded: string | null;
  bail: boolean;
  message: string | null;
  messageAge: number;
};

export function createTrickSystem() {
  const state: TrickState = {
    grab: null,
    grabTime: 0,
    active: null,
    t: 0,
    boardSpin: { x: 0, y: 0, z: 0 },
    lastLanded: null,
    bail: false,
    message: null,
    messageAge: 0,
  };

  function classifyFlick(dx: number, dy: number): TrickDef | null {
    const mag = Math.hypot(dx, dy);
    if (mag < 40) return null;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const diagonal = Math.min(ax, ay) / Math.max(ax, ay) > 0.45;

    if (diagonal) {
      if (dy < 0 && dx < 0) return TRICKS.find((t) => t.id === "varial")!;
      if (dy < 0 && dx > 0) return TRICKS.find((t) => t.id === "hardflip")!;
      if (dy > 0 && dx < 0) return TRICKS.find((t) => t.id === "varial")!;
      return TRICKS.find((t) => t.id === "hardflip")!;
    }
    if (ay >= ax) {
      return dy < 0
        ? TRICKS.find((t) => t.id === "shoveit")!
        : TRICKS.find((t) => t.id === "fs180")!;
    }
    return dx < 0
      ? TRICKS.find((t) => t.id === "kickflip")!
      : TRICKS.find((t) => t.id === "heelflip")!;
  }

  function tryFlick(dx: number, dy: number, airborne: boolean) {
    if (!airborne || state.active || state.grab) return;
    const trick = classifyFlick(dx, dy);
    if (!trick) return;
    state.active = trick;
    state.t = 0;
    state.boardSpin = { x: 0, y: 0, z: 0 };
    state.message = trick.name;
    state.messageAge = 0;
    state.bail = false;
  }

  function setGrab(dx: number, dy: number, enabled: boolean, airborne: boolean) {
    const selected = enabled && airborne && !state.active ? classifyGrab(dx, dy) : null;
    if (selected?.id !== state.grab?.id) state.grabTime = 0;
    state.grab = selected;
    if (selected) { state.message = selected.name; state.messageAge = 0; }
  }

  function update(dt: number, grounded: boolean, _uprightDot: number, _speed: number) {
    if (state.grab) {
      if (grounded) { state.lastLanded = state.grab.name; state.grab = null; }
      else { state.grabTime += dt; state.message = state.grab.name; state.messageAge = 0; }
    }
    if (state.message) {
      state.messageAge += dt;
      if (state.messageAge > 1.4) {
        state.message = null;
      }
    }

    if (state.active) {
      state.t += dt;
      const u = Math.min(1, state.t / state.active.duration);
      // ease-out spin
      const e = 1 - Math.pow(1 - u, 2);
      state.boardSpin.x = state.active.spinX * e;
      state.boardSpin.y = state.active.spinY * e;
      state.boardSpin.z = state.active.spinZ * e;

      if (u >= 1) {
        // finished rotation — keep final orientation until land
      }
    }

    // Landing resolution
    if (grounded && (state.active || state.boardSpin.y !== 0 || state.boardSpin.z !== 0)) {
      const incomplete = state.active !== null && state.t < state.active.duration * 0.72;

      if (incomplete) {
        state.bail = true;
        state.message = "Bail!";
        state.messageAge = 0;
      } else if (state.active) {
        state.lastLanded = state.active.name;
        state.message = state.active.name;
        state.messageAge = 0;
      }

      state.active = null;
      state.t = 0;
      state.boardSpin = { x: 0, y: 0, z: 0 };
    }
  }

  function clearBail() {
    state.bail = false;
  }

  function reset() {
    state.grab = null; state.grabTime = 0;
    state.active = null; state.t = 0; state.bail = false;
    state.boardSpin = { x: 0, y: 0, z: 0 };
    state.message = state.lastLanded = null; state.messageAge = 0;
  }
  return { state, setGrab, tryFlick, update, clearBail, reset };
}
