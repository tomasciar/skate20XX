export const SENSITIVITY={min:.5,max:2,default:1,step:.05} as const;
export const SENSITIVITY_CONTROLS=['carve','flip','turn'] as const;
export type SensitivityControl=typeof SENSITIVITY_CONTROLS[number];
export type SensitivitySettings=Record<SensitivityControl,number>;

export function clampSensitivity(value:number) {
  return Number.isFinite(value)?Math.min(SENSITIVITY.max,Math.max(SENSITIVITY.min,value)):SENSITIVITY.default;
}
