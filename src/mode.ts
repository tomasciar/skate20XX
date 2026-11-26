import { readGameValue } from './storage.ts';
import type { Object3D } from 'three';

export type RideMode='skate'|'snowboard';
export const MODE_STORAGE_KEY='skate20XX.rideMode';
export const MODE_TITLES:Record<RideMode,string>={skate:'skate20XX',snowboard:'SNOW5'};
type ModeStorage=Pick<Storage,'getItem'|'setItem'>;
export function isRideMode(value:unknown):value is RideMode {return value==='skate' || value==='snowboard';}
export function loadRideMode(storage?:ModeStorage):RideMode {
  try {const value=readGameValue(storage ?? globalThis.localStorage, MODE_STORAGE_KEY);return isRideMode(value)?value:'skate';}
  catch {return 'skate';}
}
export function saveRideMode(mode:RideMode,storage?:ModeStorage) {
  try {(storage ?? globalThis.localStorage).setItem(MODE_STORAGE_KEY,mode);}catch { /* Private browsing can block storage. */ }
}
/** Skin tags survive ragdoll cloning, so switching also updates an ongoing crash. */
export function applyRideSkin(root:Object3D,mode:RideMode) {
  root.traverse(object=>{
    if(object.userData.characterSlot)object.userData.characterMode=mode;
    if(isRideMode(object.userData.rideSkin))object.visible=object.userData.rideSkin===mode;
  });
}
