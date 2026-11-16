import type { LandingGrade } from "./landing.ts";
import type { TrickId, TrickState } from "./tricks.ts";

/** Scoring rules. Everything a run can earn is tuned here. */
export const SCORE = {
  /** Points per metre travelled down the course. */
  distance: 1,
  /** Board tricks, single rotation. Diagonals need two inputs and turn on two axes. */
  trick: { shoveit: 150, fs180: 150, kickflip: 200, heelflip: 200, varial: 350, hardflip: 400 } as Record<TrickId, number>,
  /** Multiplier for a single, double, triple and quadruple board trick. */
  spins: [1, 2.5, 4.5, 7],
  /** Whole-body rotations, one turn. A corkscrew turns on both axes at once. */
  flip: 600,
  roll: 600,
  corkscrew: 1000,
  /** Multiplier for one, two and three body rotations. */
  turns: [1, 2.5, 4.5],
  /** A grab scores for being caught, then for every second held up to `grabMaxHold`. */
  grab: 100,
  grabPerSecond: 300,
  grabMinHold: 0.15,
  grabMaxHold: 2,
  /** Each extra trick in one air adds this much to the multiplier of the whole air. */
  combo: 0.25,
  comboMax: 3,
  landing: { Perfect: 1.5, Clean: 1.2 } as Record<LandingGrade, number>,
  /** Points per metre, on top of distance. */
  manual: 2,
  ridingGrab: 0.5,
  /** Points per metre ground, keyed by `grindKey` of the grind's name. */
  grind: {
    "5050": 5, "50": 6, nose: 7, tail: 6, crooked: 8, smith: 9, feeble: 8, salad: 8, overcrook: 9,
    boardslide: 6, noseslide: 7, tailslide: 7, lipslide: 8, bluntslide: 10, noseblunt: 11,
  } as Record<string, number>,
  grindDefault: 5,
};

export type LandedTrick = { id: TrickId; spins: number };
/** One fixed tick of the ride, sampled after the trick system has resolved it. */
export type RideSample = {
  /** Metres along the course. */
  distance: number;
  grounded: boolean;
  crashed: boolean;
  /** Grade of a touchdown on this tick; read it before `tricks.update` clears it. */
  landing?: LandingGrade | null;
  /** `name` is optional so grinds score before and after they are told apart. */
  grind?: { active: boolean; meters: number; name?: unknown };
  /** Accumulated whole-body rotation, radians (see `AirRotationState`). */
  pitch?: number;
  roll?: number;
};

const TURN = Math.PI * 2;
/** Beyond the table every further rotation is worth one more step of its last increment. */
function rotations(table: readonly number[], count: number) {
  const last = table.length - 1;
  return table[count - 1] ?? table[last]! + (table[last]! - (table[last - 1] ?? 0)) * (count - table.length);
}

export function trickPoints(id: TrickId, spins = 1) {
  return spins < 1 ? 0 : (SCORE.trick[id] ?? 0) * rotations(SCORE.spins, Math.round(spins));
}

/** Counts turns the same way `describeAirRotation` names them. */
export function flipPoints(pitch: number, roll: number) {
  const flips = Math.round(Math.abs(pitch) / TURN), rolls = Math.round(Math.abs(roll) / TURN);
  if (!flips && !rolls) return 0;
  return (flips && rolls ? SCORE.corkscrew : flips ? SCORE.flip : SCORE.roll) * rotations(SCORE.turns, Math.max(flips, rolls));
}

export function grabPoints(seconds: number) {
  return seconds < SCORE.grabMinHold ? 0 : SCORE.grab + SCORE.grabPerSecond * Math.min(seconds, SCORE.grabMaxHold);
}

/** "50–50 GRIND", "50-50" and "5050" are one grind; "Nosegrind" and "nose" another. */
export function grindKey(name: unknown) {
  if (typeof name !== "string") return "";
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return key.replace(/grind$/, "") || key;
}
export function grindRate(name?: unknown) {
  const key = grindKey(name);
  return Object.hasOwn(SCORE.grind, key) ? SCORE.grind[key]! : SCORE.grindDefault;
}

/** Everything landed in one air: the sum, scaled by how many tricks it held and how it was put down. */
export function airPoints(tricks: readonly number[], landing?: LandingGrade | null) {
  let sum = 0;
  for (const points of tricks) sum += points;
  const combo = Math.min(SCORE.comboMax, 1 + SCORE.combo * Math.max(0, tricks.length - 1));
  return Math.round(sum * combo * (landing ? SCORE.landing[landing] ?? 1 : 1));
}

/**
 * Scores one run from state sampled every tick. Tricks are held until the air (or the grind, or the manual)
 * ends cleanly; a bail or crash drops whatever was pending and freezes the run at what it had banked.
 */
export function createScore() {
  const air: number[] = [];
  let banked = 0, origin = Infinity, far = -Infinity, ended = false;
  let seen = -1, grab: string | null = null, held = 0;
  let riding: TrickState["ground"] = null, rode = 0;
  let railMeters = 0, railPoints = 0;
  let wasAirborne = false, pitch = 0, roll = 0;

  function drop() {
    air.length = 0; grab = null; held = 0; riding = null; rode = 0;
    railMeters = railPoints = 0; wasAirborne = false; pitch = roll = 0;
  }
  function reset() {
    drop(); banked = 0; origin = Infinity; far = -Infinity; ended = false; seen = -1;
  }

  function step(tricks: TrickState, ride: RideSample) {
    const landings = tricks.landings ?? 0;
    if (ended || seen < 0) seen = landings;
    if (ended) return;
    if (ride.crashed || tricks.bail) { drop(); ended = true; return; }
    // A restart can be sampled before the course rewinds, so a distance behind the start becomes the start.
    if (ride.distance < origin) origin = far = ride.distance;
    far = Math.max(far, ride.distance);
    const onRail = !!ride.grind?.active, airborne = !ride.grounded && !onRail;

    if (landings !== seen) {
      seen = landings;
      for (const trick of tricks.landed ?? []) air.push(trickPoints(trick.id, trick.spins));
    }
    const grabbed = tricks.grab?.id ?? null;
    if (grabbed !== grab || tricks.grabTime < held) {
      const points = grab ? grabPoints(held) : 0;
      if (points) air.push(points);
      grab = grabbed; held = 0;
    }
    if (grabbed) held = tricks.grabTime;
    // Rotation is cleared on touchdown, so a flip is counted from the tick before it.
    if (wasAirborne && ride.grounded) {
      const points = flipPoints(pitch, roll);
      if (points) air.push(points);
    }
    pitch = ride.pitch ?? 0; roll = ride.roll ?? 0; wasAirborne = airborne;
    if (!airborne && air.length) { banked += airPoints(air, ride.landing); air.length = 0; }

    if (tricks.ground !== riding || tricks.groundMeters < rode) {
      if (riding) banked += rode * (riding.manual ? SCORE.manual : SCORE.ridingGrab);
      riding = tricks.ground; rode = 0;
    }
    if (riding) rode = tricks.groundMeters;

    if (onRail) {
      const meters = ride.grind!.meters;
      // The name is read per tick, so changing position mid-grind pays each stretch at its own rate.
      railPoints += (meters < railMeters ? meters : meters - railMeters) * grindRate(ride.grind!.name);
      railMeters = meters;
    } else if (railPoints) { banked += railPoints; railMeters = railPoints = 0; }
  }

  return {
    step, reset,
    get total() { return Math.floor(banked + (far > origin ? far - origin : 0) * SCORE.distance); },
    /** Points from tricks, grinds and manuals alone. */
    get tricks() { return Math.floor(banked); },
    get ended() { return ended; },
  };
}
