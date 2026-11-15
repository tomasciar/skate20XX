import { classifyGrab, GRABS } from "./grabs.ts";
import type { GrabDef, GrabFacing } from "./grabs.ts";
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

/** Holding the trick input keeps the board turning, up to this many rotations of one trick. */
export const MAX_SPINS = 4;
/** A press this soon after a trick starts replaces it, so a diagonal's second arrow still counts. */
const REPLACE_WINDOW = 0.06;
/** Foot animation progress held while the board keeps spinning under raised feet. */
const FOOT_CLEAR = 0.63;
/** Shortest time the feet take to come back down for the catch. */
const MIN_CATCH = 0.16;
/** Fraction of a rotation that may be missing (or overshot) on touchdown. */
const LAND_TOLERANCE = 0.0785;
const COUNTS = ["", "Double ", "Triple ", "Quadruple "];

export function trickName(trick: TrickDef, spins: number) {
  if (spins <= 1) return trick.name;
  if (trick.id === "shoveit") return `${spins * 180} Shove-It`;
  if (trick.id === "fs180") return `FS ${spins * 180}`;
  return (COUNTS[spins - 1] ?? `${spins}x `) + trick.name;
}

export type GroundTrick = { name: string; manual: number; grab: GrabDef | null };
const MANUAL: GroundTrick = {name:'Manual',manual:1,grab:null};
const NOSE_MANUAL: GroundTrick = {name:'Nose Manual',manual:-1,grab:null};

export type TrickState = {
  ground: GroundTrick | null;
  groundTime: number;
  groundMeters: number;
  grab: GrabDef | null;
  grabTime: number;
  active: TrickDef | null;
  /** Foot animation time of the active trick, 0..duration. */
  t: number;
  /** Rotations the active trick is showing or committed to (1 = single). */
  spins: number;
  /** Tricks completed since takeoff, in order. */
  combo: string[];
  /** Counts every trick start, so repeats of one trick are distinguishable. */
  started: number;
  boardSpin: { x: number; y: number; z: number };
  lastLanded: string | null;
  bail: boolean;
  message: string | null;
  messageAge: number;
};

export function createTrickSystem() {
  let grabDX=0, grabDY=0, grabPress: number | undefined;
  let groundDX=0, groundDY=0, groundPress: number | undefined;
  const state: TrickState = {
    ground: null,
    groundTime: 0,
    groundMeters: 0,
    grab: null,
    grabTime: 0,
    active: null,
    t: 0,
    spins: 0,
    combo: [],
    started: 0,
    boardSpin: { x: 0, y: 0, z: 0 },
    lastLanded: null,
    bail: false,
    message: null,
    messageAge: 0,
  };

  // Active trick progress. `turns` counts rotations; while the input is held the board cruises at
  // the single trick's opening rate, and on release it eases out into the next whole rotation.
  let turns=0, target=0, held=false, dirX=0, dirY=0, elapsed=0;
  let easeFrom=0, easeTime=0, easeT=0, foot=0, footFrom=0, catchTime=0;
  let queued: { dx: number; dy: number } | null = null;

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
    if (!airborne || state.grab) return;
    const trick = classifyFlick(dx, dy);
    if (!trick) return;
    if (state.active) {
      if (elapsed >= REPLACE_WINDOW) { queued = { dx, dy }; return; }
      if (trick === state.active) return;
      state.active = trick; dirX = Math.sign(dx); dirY = Math.sign(dy);
      state.message = trickName(trick, state.spins); state.messageAge = 0;
      return;
    }
    state.active = trick;
    state.t = 0;
    state.spins = 1;
    state.started++;
    state.boardSpin = { x: 0, y: 0, z: 0 };
    state.message = trick.name;
    state.messageAge = 0;
    state.bail = false;
    turns = target = elapsed = foot = 0; held = false;
    dirX = Math.sign(dx); dirY = Math.sign(dy);
  }

  /** Call every tick with the held trick direction (0,0 when released). A hold has to start with the trick. */
  function holdFlick(dx: number, dy: number) {
    if (!state.active) return;
    held = (held || elapsed === 0) && Math.sign(dx) === dirX && Math.sign(dy) === dirY;
  }

  function endTrick() {
    state.active = null; state.t = 0; state.spins = 0;
    state.boardSpin = { x: 0, y: 0, z: 0 };
  }

  function setGrab(dx: number, dy: number, enabled: boolean, airborne: boolean, facing?: GrabFacing, press?: number) {
    if(!enabled || !airborne || state.active || state.bail || (!dx && !dy)) {
      state.grab=null;state.grabTime=0;grabDX=grabDY=0;grabPress=press;return;
    }
    // Facing is sampled on a fresh press/direction, never again during the hold.
    const fresh=!state.grab || dx!==grabDX || dy!==grabDY || press!==grabPress;
    const selected = fresh ? classifyGrab(dx,dy,facing) : state.grab;
    if(fresh)state.grabTime=0;
    if (selected?.id !== state.grab?.id) state.grabTime = 0;
    grabDX=dx;grabDY=dy;grabPress=press;
    state.grab = selected;
    if (selected) { state.message = selected.name; state.messageAge = 0; }
  }

  function clearGround() {
    state.ground = null; state.groundTime = state.groundMeters = 0;
    groundDX=groundDY=0;groundPress=undefined;
  }

  function setGround(dx: number, dy: number, allowed: boolean, facing?: GrabFacing, press?: number) {
    if (!allowed || state.active || state.bail || (!dx && !dy)) { clearGround(); return; }
    if (state.ground && dx===groundDX && dy===groundDY && press===groundPress) return;
    if (dy) state.ground = dy>0 ? MANUAL : NOSE_MANUAL;
    else {
      const direction=classifyGrab(dx,0,facing)?.direction;
      // Riding grabs reach the deck in place rather than pulling it into an aerial tweak.
      const grab=direction==='back' ? GRABS.melon : direction==='nose' ? GRABS.nosegrab
        : direction==='tail' ? GRABS.tailgrab : GRABS.indy;
      state.ground={name:grab.name,manual:0,grab};
    }
    groundDX=dx;groundDY=dy;groundPress=press;
    state.groundTime=state.groundMeters=0;
  }

  function update(dt: number, grounded: boolean, _uprightDot: number, speed: number) {
    if (state.ground) {
      if (!grounded || state.bail) clearGround();
      else {
        state.groundTime += dt; state.groundMeters += Math.max(0,speed)*dt;
        state.message=state.ground.name;state.messageAge=0;
      }
    }
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

    if (state.bail) { state.combo.length = 0; queued = null; }
    const trick = state.active;
    if (trick) {
      const D = trick.duration;
      elapsed += dt;
      if (!target && held && turns < MAX_SPINS - 1) {
        turns = Math.min(MAX_SPINS - 1, turns + 2 * dt / D);
        foot = Math.min(FOOT_CLEAR, foot + dt / D);
      } else {
        if (!target) {
          target = Math.floor(turns) + 1;
          easeFrom = target - turns; easeTime = easeFrom * D; easeT = 0;
          footFrom = foot; catchTime = Math.max(easeTime, MIN_CATCH);
        }
        easeT += dt;
        // ease-out spin
        const left = 1 - Math.min(1, easeT / easeTime);
        turns = target - easeFrom * left * left;
        foot = footFrom + (1 - footFrom) * Math.min(1, easeT / catchTime);
      }
      state.t = foot * D;
      state.boardSpin.x = trick.spinX * turns;
      state.boardSpin.y = trick.spinY * turns;
      state.boardSpin.z = trick.spinZ * turns;
      const spins = target || Math.floor(turns) + 1;
      if (spins !== state.spins) {
        state.spins = spins; state.message = trickName(trick, spins); state.messageAge = 0;
      }

      // Caught: the board is back under the feet, so another trick or a grab can start.
      if (!grounded && target && easeT >= easeTime && easeT >= catchTime) {
        state.combo.push(trickName(trick, target));
        endTrick();
        if (queued) { const next = queued; queued = null; tryFlick(next.dx, next.dy, true); }
      }
    }

    // Landing resolution
    if (grounded && (state.active || state.combo.length)) {
      const done = Math.round(turns);
      if (state.active && (done < 1 || Math.abs(turns - done) > LAND_TOLERANCE)) {
        state.bail = true;
        state.message = "Bail!";
        state.messageAge = 0;
      } else {
        if (state.active) state.combo.push(trickName(state.active, done));
        state.lastLanded = state.message = state.combo.join(" + ");
        state.messageAge = 0;
      }
      endTrick();
      state.combo.length = 0; queued = null;
    }
  }

  function clearBail() {
    state.bail = false;
    state.combo.length = 0; queued = null;
  }

  function reset() {
    clearGround();
    grabDX=grabDY=0;grabPress=undefined;
    state.grab = null; state.grabTime = 0;
    endTrick(); state.bail = false;
    state.combo.length = 0; queued = null;
    state.message = state.lastLanded = null; state.messageAge = 0;
  }
  return { state, setGrab, setGround, tryFlick, holdFlick, update, clearBail, reset };
}
