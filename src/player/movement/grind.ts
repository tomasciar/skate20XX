import * as THREE from 'three';
import { BOARD, GRIND_HEIGHT } from '../dimensions.ts';
import { dragSpeed } from './speed.ts';

export type GrindRail = { id: string; start: THREE.Vector3; end: THREE.Vector3; normal?: THREE.Vector3 };
export type GrindName = '50-50' | '5-0' | 'Nosegrind' | 'Boardslide' | 'Noseslide' | 'Tailslide';
/** `name` and `meters` keep describing the last grind after it ends, until the next catch or a reset. */
export type GrindState = { active: boolean; name: GrindName | ''; balance: number; meters: number; message: string | null };

/** Catch window and grind poses; distances in meters from the visible board's origin, angles in radians. */
export const GRIND = {
  side: 0.36,        // a truck may be this far beside the rail and still be drawn onto it
  truckOn: 0.16,     // a truck this close is already over the rail (rail and hanger half-widths)
  even: 0.1,         // trucks whose distances differ by less than this both lock on
  reach: 0.42,       // sideways, the rail must pass under the deck: half its length
  slideSplit: 0.2,   // rail under the deck between the trucks is a boardslide; beyond is nose or tail
  // Height window about the trucks resting on the rail. The lower bound reaches a board whose collision box
  // is already resting on the steel: the visible board hangs below that box by the fitted wheel offset.
  below: 0.19, above: 0.18,
  maxRise: 1,        // cannot catch while still rising faster than this
  tilt: 0.2,         // nose/tail grinds pitch about the supporting truck
  slideEnd: 0.38,    // nose/tail slides rest this far from the board's centre
  slideHeight: 0.023, slideEndHeight: -0.024, // deck underside mid-board and under the raised ends
  settle: 18,        // critically damped pull onto the rail line (1/s)
  keepSide: 3,       // across-rail approach speed carried into that pull; the rest is the impact
  turn: 10, maxTurn: 5, // easing of the board into its grind pose (1/s, rad/s)
  friction: 0.45, slideFriction: 1.4, brake: 24, pop: 6.5,
} as const;

/**
 * The grind is chosen only from how the board meets the rail:
 * within 45 degrees of the rail the trucks decide. Both over the rail is a 50-50; if only one is (the board
 * came in angled and off-centre, or one truck landed beyond the rail's end) the board locks onto that truck:
 * a Nosegrind on the truck leading the travel, a 5-0 on the trailing one.
 * Beyond 45 degrees it slides on the deck, named by where the rail crosses the board's length.
 * The board then pivots about that contact into its pose, so its position and heading never jump.
 */
export function createGrindSystem() {
  const state: GrindState = { active: false, name: '', balance: 0, meters: 0, message: null };
  let railId: string | null = null, cooldown = 0, direction = 1;
  // Contact point in board space (toward the nose, below the origin) and the pose being eased into.
  let reach = 0, contactHeight = GRIND_HEIGHT, friction: number = GRIND.friction;
  let yaw = 0, yawTarget = 0, pitch = 0, pitchTarget = 0;
  // Remaining distance from the rail line, across it and above it, with their rates.
  let side = 0, sideSpeed = 0, lift = 0, liftSpeed = 0;
  const tangent = new THREE.Vector3(), offset = new THREE.Vector3(), cross = new THREE.Vector3();
  const railNormal = new THREE.Vector3(0,1,0), flat = new THREE.Vector3();
  const heading = new THREE.Vector3(0,0,-1), nose = new THREE.Vector3(0,0,-1), deckUp = new THREE.Vector3(0,1,0);
  function reset() {
    state.active = false; state.name = ''; state.balance = state.meters = 0; state.message = null;
    railId = null; cooldown = 0;
  }
  function release(message: string) {
    state.active = false; state.message = message; railId = null; cooldown = 0.35;
  }
  function frame(rail: GrindRail, normal: THREE.Vector3) {
    railNormal.copy(rail.normal ?? normal);
    tangent.copy(rail.end).sub(rail.start).normalize();
    cross.crossVectors(tangent, railNormal).normalize();
    return rail.start.distanceTo(rail.end);
  }
  function orient() {
    heading.copy(tangent).multiplyScalar(Math.cos(yaw)).addScaledVector(cross, Math.sin(yaw));
    nose.copy(heading).multiplyScalar(Math.cos(pitch)).addScaledVector(railNormal, Math.sin(pitch));
    deckUp.copy(railNormal).multiplyScalar(Math.cos(pitch)).addScaledVector(heading, -Math.sin(pitch));
  }
  /** Board origin relative to the rail start, less the contact point's place on the board. */
  function contact(position: THREE.Vector3, rail: GrindRail) {
    return offset.copy(position).sub(rail.start).addScaledVector(deckUp, -contactHeight).addScaledVector(nose, reach);
  }
  function tryCatch(rail: GrindRail, position: THREE.Vector3, velocity: THREE.Vector3, forward: THREE.Vector3, normal: THREE.Vector3) {
    const length = frame(rail, normal);
    if (velocity.dot(railNormal) > GRIND.maxRise) return false;
    offset.copy(position).sub(rail.start);
    const along = offset.dot(tangent), across = offset.dot(cross), height = offset.dot(railNormal) - GRIND_HEIGHT;
    if (height < -GRIND.below || height > GRIND.above) return false;
    const rise = THREE.MathUtils.clamp(forward.dot(railNormal), -1, 1);
    flat.copy(forward).addScaledVector(railNormal, -rise);
    if (flat.lengthSq() < 1e-6) return false;
    flat.normalize();
    const ft = flat.dot(tangent), fc = flat.dot(cross);
    const on = (a: number) => a >= 0 && a <= length;
    direction = velocity.dot(tangent) >= 0 ? 1 : -1;
    if (Math.abs(ft) >= Math.SQRT1_2) {
      const Z = BOARD.truckZ, front = Math.abs(across + Z * fc), rear = Math.abs(across - Z * fc);
      const nearFront = on(along + Z * ft) && front <= GRIND.side, nearRear = on(along - Z * ft) && rear <= GRIND.side;
      let truck: number;
      if (nearFront && nearRear && (Math.max(front, rear) <= GRIND.truckOn || Math.abs(front - rear) < GRIND.even)) truck = 0;
      else if (nearFront && (!nearRear || front < rear)) truck = 1;
      else if (nearRear) truck = -1;
      else return false;
      reach = truck * Z; contactHeight = GRIND_HEIGHT; friction = GRIND.friction;
      yawTarget = ft >= 0 ? 0 : Math.PI; pitchTarget = -truck * GRIND.tilt;
      state.name = truck === 0 ? '50-50' : truck * ft * direction > 0 ? 'Nosegrind' : '5-0';
    } else {
      // Where the rail crosses the board's centreline, measured toward the nose.
      const crossing = -across / fc;
      if (Math.abs(crossing) > GRIND.reach) return false;
      const end = Math.abs(crossing) < GRIND.slideSplit ? 0 : Math.sign(crossing);
      if (!on(along + end * GRIND.slideEnd * ft)) return false;
      reach = end * GRIND.slideEnd; contactHeight = end ? GRIND.slideEndHeight : GRIND.slideHeight; friction = GRIND.slideFriction;
      yawTarget = fc >= 0 ? Math.PI / 2 : -Math.PI / 2; pitchTarget = 0;
      state.name = end === 0 ? 'Boardslide' : end > 0 ? 'Noseslide' : 'Tailslide';
    }
    // Start from the board exactly as it arrived; only what is left to close is eased.
    yaw = Math.atan2(fc, ft); pitch = Math.asin(rise); orient();
    contact(position, rail);
    side = offset.dot(cross); lift = offset.dot(railNormal);
    sideSpeed = THREE.MathUtils.clamp(velocity.dot(cross), -GRIND.keepSide, GRIND.keepSide);
    liftSpeed = lift > 0 ? velocity.dot(railNormal) : Math.max(0, velocity.dot(railNormal));
    railId = rail.id;
    state.active = true; state.balance = 0; state.meters = 0; state.message = state.name;
    return true;
  }
  /** `position` is the visible board's origin. Returns true whenever the grind owned this tick, including the tick it ends. */
  function update(dt: number, position: THREE.Vector3, velocity: THREE.Vector3,
    forward: THREE.Vector3, normal: THREE.Vector3, rails: readonly GrindRail[],
    steer: number, ollie: boolean, braking: boolean, canCatch: boolean, tuck = 0) {
    cooldown = Math.max(0, cooldown - dt);
    if (!state.active && cooldown === 0 && canCatch && velocity.length() > 2) {
      for (const rail of rails) if (tryCatch(rail, position, velocity, forward, normal)) break;
    }
    if (!state.active) return false;
    // Every exit leaves position and heading untouched: the board flies on from where it sits.
    const rail = rails.find(r => r.id === railId);
    if (!rail) { release('Grind complete'); return true; }
    const length = frame(rail, normal);
    orient();
    const along = contact(position, rail).dot(tangent);
    if (along < 0 || along > length) { release('Grind complete'); return true; }
    state.balance = THREE.MathUtils.clamp(state.balance + steer * dt * 1.8, -1.1, 1.1);
    if (Math.abs(state.balance) > 1) {
      release('Slipped off'); velocity.addScaledVector(cross, steer * 2);
      return true;
    }
    // Pivot about the contact point into the grind pose.
    const ease = 1 - Math.exp(-GRIND.turn * dt), limit = GRIND.maxTurn * dt;
    const turn = Math.atan2(Math.sin(yawTarget - yaw), Math.cos(yawTarget - yaw));
    yaw += THREE.MathUtils.clamp(turn * ease, -limit, limit);
    pitch += THREE.MathUtils.clamp((pitchTarget - pitch) * ease, -limit, limit);
    orient();
    const w = GRIND.settle;
    sideSpeed += (-w * w * side - 2 * w * sideSpeed) * dt;
    if (Math.abs(lift) < 1e-5) lift = liftSpeed = 0;
    else if (lift > 0) {
      // Still dropping onto the rail: fall freely and stop exactly on it.
      liftSpeed -= 18 * railNormal.y * dt;
      if (lift + liftSpeed * dt <= 0) liftSpeed = -lift / dt;
    } else liftSpeed += (-w * w * lift - 2 * w * liftSpeed) * dt;
    const signedSpeed = velocity.dot(tangent);
    const gravity = -18 * tangent.y;
    const drag = (braking ? GRIND.brake : friction) * direction;
    const speed = dragSpeed(Math.max(0,(signedSpeed + (gravity - drag) * dt)*direction),dt,tuck);
    position.copy(rail.start).addScaledVector(tangent, along).addScaledVector(deckUp, contactHeight)
      .addScaledVector(nose, -reach).addScaledVector(cross, side).addScaledVector(railNormal, lift);
    velocity.copy(tangent).multiplyScalar(speed * direction).addScaledVector(cross, sideSpeed).addScaledVector(railNormal, liftSpeed);
    side += sideSpeed * dt; lift += liftSpeed * dt;
    state.meters += speed * dt;
    if (ollie) {
      // Pop off the rail itself, even if the board had not finished settling onto it.
      release('Ollie out'); velocity.addScaledVector(railNormal, GRIND.pop - liftSpeed);
    } else if (speed < 0.5) {
      release('Slipped off');
    }
    return true;
  }
  return { state, normal: railNormal, tangent, heading, get pitch() { return pitch; }, update, reset };
}
