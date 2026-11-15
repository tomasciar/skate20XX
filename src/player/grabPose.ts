import * as THREE from 'three';

export type GrabTweak = {
  offset: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  hipX: number;
  crouch: number;
  hipDrop: number;
  chestPitch: number;
  chestRoll: number;
  kneePole?: { x: number; y: number; z: number };
};
/** Rider space: -X is the left/front foot, +X is the right/rear foot; -Z faces the chest. */
export const TUCK: GrabTweak = { offset:{x:0,y:0.28,z:0},rotation:{x:0,y:0,z:0},hipX:0,crouch:1,hipDrop:0.04,chestPitch:-0.6,chestRoll:0 };
export const TOMAHAWK: GrabTweak = { offset:{x:0,y:0.62,z:0.42},rotation:{x:-1.1,y:0,z:0},hipX:0,crouch:0.15,hipDrop:0.01,chestPitch:0.45,chestRoll:0,kneePole:{x:0,y:-1,z:0} };
export const PUSH_OUT: GrabTweak = { offset:{x:0,y:0.17,z:-0.42},rotation:{x:-0.18,y:0,z:0},hipX:0,crouch:0.6,hipDrop:0.03,chestPitch:-1.25,chestRoll:0 };
export const NOSEBONE: GrabTweak = { offset:{x:-0.30,y:0.22,z:-0.06},rotation:{x:0,y:0,z:-0.12},hipX:0.055,crouch:0.65,hipDrop:0.02,chestPitch:-0.95,chestRoll:0.18 };
export const TAILBONE: GrabTweak = { ...NOSEBONE,offset:{x:0.30,y:0.22,z:-0.06},rotation:{x:0,y:0,z:0.12},hipX:-0.055,chestRoll:-0.18 };
export function grabTransform(tweak: GrabTweak, blend: number) {
  const offset = new THREE.Vector3(tweak.offset.x,tweak.offset.y,tweak.offset.z).multiplyScalar(blend);
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(tweak.rotation.x*blend,tweak.rotation.y*blend,tweak.rotation.z*blend));
  return { offset,rotation };
}
