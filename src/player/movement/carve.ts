/** Turning model: steering leans the deck, lean turns the trucks, and grip limits the arc at speed. */
export const CARVE = {
  /** Lateral acceleration the wheels can hold, m/s². Above ~14 m/s this widens the turning arc. */
  maxLateral: 30,
  /** How quickly weight shifts onto an edge, 1/s. */
  response: 9,
  /** Speed lost per second in a full-grip carve, m/s². */
  scrub: 2.5,
  /** Seconds for the wheels to pull the direction of travel onto the board's heading. */
  grip: 0.15,
  /** Deceleration when the board is fully sideways to its travel, m/s²: a landing off-axis slides before it rolls. */
  slide: 12,
  /** Deck roll at a full carve, radians. Kept below wheel bite. */
  deckTilt: 0.12,
} as const;

/** Yaw rate at full lean, rad/s: tight at walking pace, then bounded by lateral grip. */
export function carveTurnRate(speed: number) {
  const low = 1.3 + 0.8 * Math.min(1, Math.max(0, speed) / 14);
  return Math.min(low, CARVE.maxLateral / Math.max(speed, 0.001));
}

/** Share of the available grip in use, 0..1. */
export function carveLoad(speed: number, lean: number) {
  return Math.min(1, Math.abs(lean) * carveTurnRate(speed) * Math.max(0, speed) / CARVE.maxLateral);
}

/** Wheels scrub speed in proportion to how hard they are loaded; gentle steering is nearly free. */
export function carveDrag(speed: number, lean: number) {
  const load = carveLoad(speed, lean);
  return CARVE.scrub * load * load;
}

/** Signed lean shown by the deck and rider: a little at a standstill, full once the turn loads the wheels. */
export function carveLean(speed: number, lean: number) {
  return lean * (0.3 + 0.7 * Math.min(1, carveTurnRate(speed) * Math.max(0, speed) / CARVE.maxLateral));
}
