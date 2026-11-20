import { LANDING_SPEED } from "./speed.ts";

const DEG = Math.PI / 180;

/** Touchdown rules: how hard the wheels may hit, and what a well-aimed landing earns. */
export const LANDING = {
  /** Impact along the surface normal that always rides away, world units/s. */
  hardImpact: 20,
  /**
   * Extra impact a straight landing absorbs per world units/s of rolling speed. At speed a few degrees of slope
   * change turn forward motion into a heavy touchdown, so a fixed limit would make fast airs unlandable.
   */
  glancing: 0.25,
  /** Board within this angle of its travel (either way round) keeps the whole allowance, radians. */
  clean: 15 * DEG,
  /** Beyond this the landing gets no allowance: only `hardImpact` protects a crooked touchdown. */
  loose: 45 * DEG,
  perfect: 5 * DEG,
  /** Share of the touchdown a graded landing pumps back into rolling speed. */
  perfectBoost: 0.1,
  cleanBoost: 0.05,
  maxBoost: 2,
  /** Impacts at least this hard are named on screen even without a trick, world units/s. */
  callout: 12,
} as const;

export type LandingGrade = "Perfect" | "Clean";
export type Landing = {
  /** Hardest survivable impact for this touchdown, world units/s. */
  limit: number;
  /** Null for a crooked landing, or a touchdown too soft to count as one. */
  grade: LandingGrade | null;
  /** Rolling speed gained, world units/s. */
  boost: number;
};

/**
 * @param impact speed into the surface, world units/s
 * @param rolling speed along the surface, world units/s
 * @param misalignment angle between the board and its travel (switch counts as aligned) or, mid-flip,
 *   its tilt from the surface if that is larger, radians
 */
export function judgeLanding(impact: number, rolling: number, misalignment: number): Landing {
  const u = Math.max(0, Math.min(1, (misalignment - LANDING.clean) / (LANDING.loose - LANDING.clean)));
  const precision = 1 - u * u * (3 - 2 * u);
  const limit = LANDING.hardImpact + LANDING.glancing * Math.max(0, rolling) * precision;
  const grade = impact < LANDING_SPEED || misalignment > LANDING.clean ? null
    : misalignment <= LANDING.perfect ? "Perfect" : "Clean";
  const boost = grade ? Math.min(LANDING.maxBoost, impact * (grade === "Perfect" ? LANDING.perfectBoost : LANDING.cleanBoost)) : 0;
  return { limit, grade, boost };
}
