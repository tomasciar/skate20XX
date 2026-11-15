export type GrabId = 'nosegrab' | 'tailgrab' | 'melon' | 'indy';
/** Grip targets are in rider space: +X toward the nose, -Z toward the toes. */
export type GrabDef = { id: GrabId; name: string; hand: -1 | 1; grip: { x: number; y: number; z: number } };
export const GRABS: Record<GrabId, GrabDef> = {
  nosegrab: { id: 'nosegrab', name: 'Nose Grab', hand: 1, grip: { x: 0.36, y: 0.07, z: 0 } },
  tailgrab: { id: 'tailgrab', name: 'Tail Grab', hand: -1, grip: { x: -0.36, y: 0.07, z: 0 } },
  melon: { id: 'melon', name: 'Melon Grab', hand: 1, grip: { x: 0.02, y: 0.035, z: 0.105 } },
  indy: { id: 'indy', name: 'Indy Grab', hand: -1, grip: { x: -0.02, y: 0.035, z: -0.105 } },
};
export function classifyGrab(dx: number, dy: number): GrabDef | null {
  if (!dx && !dy) return null;
  // Vertical wins a diagonal, so overlapping key presses have a stable selection.
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? GRABS.nosegrab : GRABS.tailgrab;
  return dx < 0 ? GRABS.melon : GRABS.indy;
}
