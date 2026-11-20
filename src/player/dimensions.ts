/** Shared by the mesh and its contact solver; distances are simulation units (see units.ts for the fixed metre calibration). */
export const BOARD = {
  wheelRadius: 0.036,
  wheelY: -0.055,
  wheelX: 0.09,
  truckZ: 0.26,
  hangerY: -0.045,
  hangerHalfHeight: 0.0125,
  gripY: 0.011,
  soleBottom: -0.0185,
} as const;
export const WHEEL_BOTTOM = BOARD.wheelY - BOARD.wheelRadius;
export const SNOWBOARD = {halfWidth:0.12,halfLength:0.68,baseY:WHEEL_BOTTOM} as const;
export const FOOT_Y = BOARD.gripY - BOARD.soleBottom;
export const GRIND_HEIGHT = -BOARD.hangerY + BOARD.hangerHalfHeight;

export const RIDER = { upperLeg: 0.34, lowerLeg: 0.34, hipHeight: 0.65, stanceY: -Math.PI/2 } as const;

/** Local mounts: x right, y up, z toward tail. Nose is -Z. */
export const WHEEL_MOUNTS = [
  { x: -BOARD.wheelX, y: -0.02, z: -BOARD.truckZ },
  { x: BOARD.wheelX, y: -0.02, z: -BOARD.truckZ },
  { x: -BOARD.wheelX, y: -0.02, z: BOARD.truckZ },
  { x: BOARD.wheelX, y: -0.02, z: BOARD.truckZ },
];
