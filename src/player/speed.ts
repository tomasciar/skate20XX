export const MPH_PER_MPS = 2.23694;
export const MAX_SPEED = 199 / MPH_PER_MPS;
/** Fast initial gains, then diminishing returns. Initial pushes help; downhill speed continues building after pushing stops. */
export function approachTopSpeed(speed: number, dt: number, pushing: boolean) {
  return MAX_SPEED - (MAX_SPEED - Math.min(MAX_SPEED, Math.max(0, speed))) * Math.exp(-dt / (pushing ? 9 : 12));
}
/**
 * Touchdown speed that counts as a landing, m/s. The smallest ollie (a tap from a standstill) rises about
 * 0.66 m and comes down at 5 m/s; anything gentler is the board settling, not a landing.
 */
export const LANDING_SPEED = 4.5;
