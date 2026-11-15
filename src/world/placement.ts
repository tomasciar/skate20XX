import * as THREE from 'three';
import { landscapeWorldHeight } from './landscape.ts';
import { courseX, courseHeading } from './course.ts';
import { foundationMaterial } from './scenery.ts';

/** Furniture/parking gets a level terrace; fences follow the surface; trees stay upright. */
export function placeScenery(object: THREE.Object3D, x: number, along: number, chunkStart: number, baseHeight: number, hillAngle: number, yaw = 0, baseX = 0) {
  const globalAlong=chunkStart+along;
  x+=courseX(globalAlong);
  yaw+=courseHeading(globalAlong,hillAngle);
  const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(hillAngle,yaw,0));
  if (object.userData.placement === 'pad') {
    const bounds=new THREE.Box3().setFromObject(object), corners: THREE.Vector3[]=[];
    let floor=-Infinity;
    const margin=0.2;
    for (const px of [bounds.min.x-margin,bounds.max.x+margin]) for (const pz of [bounds.min.z-margin,bounds.max.z+margin]) {
      const corner=new THREE.Vector3(px,0,pz).applyQuaternion(rotation);
      corners.push(corner);
      floor=Math.max(floor,landscapeWorldHeight(x+corner.x,globalAlong-corner.z)-corner.y);
    }
    floor+=0.015;
    let depth=0.12;
    for (const corner of corners) depth=Math.max(depth,(floor+corner.y-landscapeWorldHeight(x+corner.x,globalAlong-corner.z))/Math.cos(hillAngle)+0.12);
    const root=new THREE.Group();
    root.position.set(x-baseX,floor-baseHeight,-along);root.quaternion.copy(rotation);
    object.position.y=-Math.max(0,bounds.min.y);root.add(object);
    const pad=new THREE.Mesh(new THREE.BoxGeometry(bounds.max.x-bounds.min.x+margin*2,depth,bounds.max.z-bounds.min.z+margin*2),foundationMaterial);
    pad.position.set((bounds.min.x+bounds.max.x)/2,-depth/2,(bounds.min.z+bounds.max.z)/2); pad.receiveShadow=true; root.add(pad);
    root.userData.support='level-pad'; root.userData.padDepth=depth;
    return root;
  }
  object.position.set(x-baseX,landscapeWorldHeight(x,globalAlong)-baseHeight,-along);
  if (object.userData.placement === 'slope') {
    const dx=landscapeWorldHeight(x+0.5,globalAlong)-landscapeWorldHeight(x-0.5,globalAlong);
    const ds=landscapeWorldHeight(x,globalAlong+0.5)-landscapeWorldHeight(x,globalAlong-0.5);
    const up=new THREE.Vector3(-dx,1,ds).normalize();
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),up).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw));
  } else object.quaternion.copy(rotation);
  return object;
}
