import { TUCK, TOMAHAWK, PUSH_OUT, NOSEBONE, TAILBONE } from '../animation/grabPose.ts';
import type { GrabTweak } from '../animation/grabPose.ts';
import * as THREE from 'three';
export type GrabId = 'nosegrab' | 'tailgrab' | 'melon' | 'indy' | 'tomahawk' | 'pushout' | 'nosebone' | 'tailbone';
type Direction = 'nose' | 'tail' | 'front' | 'back';
/** Grip targets are in rider space: -X toward the nose, -Z toward the toes. */
export type GrabDef = { id: GrabId; name: string; hand: -1 | 1; grip: { x: number; y: number; z: number }; tweak: GrabTweak; direction?: Direction };
export const GRABS: Record<GrabId, GrabDef> = {
  nosegrab: { id:'nosegrab',name:'Nose Grab',hand:-1,grip:{x:-0.36,y:0.07,z:0},tweak:TUCK },
  tailgrab: { id:'tailgrab',name:'Tail Grab',hand:1,grip:{x:0.36,y:0.07,z:0},tweak:TUCK },
  melon: { id:'melon',name:'Melon Grab',hand:1,grip:{x:0.02,y:0.035,z:0.105},tweak:TUCK },
  indy: { id:'indy',name:'Indy Grab',hand:-1,grip:{x:-0.02,y:0.035,z:-0.105},tweak:TUCK },
  tomahawk: { id:'tomahawk',name:'Tomahawk Grab',hand:1,grip:{x:0.38,y:0.035,z:0.035},tweak:TOMAHAWK,direction:'back' },
  pushout: { id:'pushout',name:'Push-Out Grab',hand:-1,grip:{x:-0.02,y:0.035,z:0.105},tweak:PUSH_OUT,direction:'front' },
  nosebone: { id:'nosebone',name:'Nosebone Grab',hand:-1,grip:{x:-0.02,y:0.035,z:-0.105},tweak:NOSEBONE,direction:'nose' },
  tailbone: { id:'tailbone',name:'Tailbone Grab',hand:1,grip:{x:0.02,y:0.035,z:-0.105},tweak:TAILBONE,direction:'tail' },
};
export type GrabFacing = { noseX: number; noseY: number; chestX: number; chestY: number };
const DEFAULT_FACING: GrabFacing = { noseX:0,noseY:-1,chestX:1,chestY:0 };
/** Project the rider's nose and chest onto the fixed downhill camera's direction frame. */
export function screenGrabFacing(forward: THREE.Vector3, course: THREE.Vector3, normal: THREE.Vector3): GrabFacing {
  const right=new THREE.Vector3().crossVectors(course,normal).normalize();
  const chest=new THREE.Vector3().crossVectors(forward,normal).normalize();
  return {noseX:forward.dot(right),noseY:-forward.dot(course),chestX:chest.dot(right),chestY:-chest.dot(course)};
}
/** Resolve screen direction once when a grab begins; the trick system latches the result. */
export function classifyGrab(dx: number, dy: number, facing: GrabFacing = DEFAULT_FACING): GrabDef | null {
  if (!dx && !dy) return null;
  const nose=dx*facing.noseX+dy*facing.noseY, chest=dx*facing.chestX+dy*facing.chestY;
  if(Math.abs(nose)>=Math.abs(chest)) return nose>0 ? GRABS.nosebone : GRABS.tailbone;
  return chest>0 ? GRABS.pushout : GRABS.tomahawk;
}
