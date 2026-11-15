export const MPH_PER_MPS = 2.23694;
export const MAX_SPEED = 199 / MPH_PER_MPS;
/** Fast initial gains, then diminishing returns. Initial pushes help; downhill speed continues building after pushing stops. */
export function approachTopSpeed(speed: number, dt: number, pushing: boolean) {
  return MAX_SPEED - (MAX_SPEED - Math.min(MAX_SPEED, Math.max(0, speed))) * Math.exp(-dt / (pushing ? 9 : 12));
}
