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
/** Pull-back tweaks ease off as a flip already tips the rider onto their back; `amount` 0 returns the tweak as is. */
export function softenGrab(tweak: GrabTweak, amount: number): GrabTweak {
  if(amount<=0) return tweak;
  // Lowering the board straightens the legs; easing only its pull-back would fold the knees through the deck.
  return {...tweak,chestPitch:tweak.chestPitch*(1-0.27*amount),
    offset:{...tweak.offset,y:tweak.offset.y*(1-0.12*amount),z:tweak.offset.z*(1-0.1*amount)}};
}
/** A reusable transform for an animated rig; reset every field before returning it. */
export function createGrabTransform() {
  const result={offset:new THREE.Vector3(),rotation:new THREE.Quaternion()},angles=new THREE.Euler();
  return (tweak:GrabTweak,blend:number)=>{
    result.offset.set(tweak.offset.x,tweak.offset.y,tweak.offset.z).multiplyScalar(blend);
    result.rotation.setFromEuler(angles.set(tweak.rotation.x*blend,tweak.rotation.y*blend,tweak.rotation.z*blend));
    return result;
  };
}
export function grabTransform(tweak:GrabTweak,blend:number) {
  return createGrabTransform()(tweak,blend);
}
