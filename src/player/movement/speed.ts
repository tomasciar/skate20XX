export {MPH_PER_MPS} from '../../units.ts';
/** Game-scale resistance: gravity provides acceleration; stance and terrain set the balance. */
export const SPEED = {
  rollingResistance: 0.16,
  dragUpright: 0.00035,
  dragTucked: 0.0002,
  pushAcceleration: 10,
} as const;

/** Exact quadratic-drag step: high speeds lose more energy without an arbitrary velocity clamp. */
export function dragSpeed(speed: number, dt: number, tuck = 0) {
  const drag=SPEED.dragUpright+(SPEED.dragTucked-SPEED.dragUpright)*Math.max(0,Math.min(1,tuck));
  const magnitude=Math.max(0,speed);
  return magnitude/(1+drag*magnitude*Math.max(0,dt));
}

/** Tangential wheel resistance; callers let the physics world's gravity act normally. */
export function coastSpeed(speed: number, dt: number, tuck = 0, normalLoad = 1) {
  return Math.max(0,dragSpeed(speed,dt,tuck)-SPEED.rollingResistance*Math.max(0,normalLoad)*Math.max(0,dt));
}
/**
 * Touchdown speed that counts as a landing, world units/s. The smallest ollie (a tap from a standstill) rises about
 * 0.66 world units and comes down at 5 world units/s; anything gentler is the board settling, not a landing.
 */
export const LANDING_SPEED = 4.5;
