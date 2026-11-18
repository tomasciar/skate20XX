import * as THREE from 'three';
import { landscapeWorldHeight } from '../terrain/landscape.ts';
import { courseX, courseHeading } from '../terrain/course.ts';
import {foundationMaterial} from './parts.ts';

/** Furniture/parking gets a level terrace; fences follow the surface; trees stay upright. */
export function placeScenery(object: THREE.Object3D, x: number, along: number, chunkStart: number, baseHeight: number, hillAngle: number, yaw = 0, baseX = 0) {
  const globalAlong=chunkStart+along;
  x+=courseX(globalAlong);
  yaw+=courseHeading(globalAlong,hillAngle);
  const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(hillAngle,yaw,0));
  if (object.userData.placement === 'pad') {
    const bounds=new THREE.Box3().setFromObject(object), support: THREE.Vector3[]=[];
    let floor=-Infinity;
    const margin=0.2;
    const samples=(min:number,max:number)=>{
      const values=new Set([min,(min+max)/2,max]);
      if(min<=0 && max>=0)values.add(0);
      const steps=Math.ceil((max-min)/2.5);
      for(let i=1;i<steps;i++)values.add(min+(max-min)*i/steps);
      return [...values];
    };
    // Convex banks can peak inside a lot rather than at a corner. Include the center,
    // edge midpoints and a small interior grid so furniture and foundations stay exposed.
    for (const px of samples(bounds.min.x-margin,bounds.max.x+margin)) for (const pz of samples(bounds.min.z-margin,bounds.max.z+margin)) {
      const corner=new THREE.Vector3(px,0,pz).applyQuaternion(rotation);
      support.push(corner);
      floor=Math.max(floor,landscapeWorldHeight(x+corner.x,globalAlong-corner.z)-corner.y);
    }
    floor+=0.025;
    let depth=0.12;
    const upY=Math.cos(hillAngle),upZ=Math.sin(hillAngle);
    // A level foundation extends downhill in the tilted hill frame as it gets deeper.
    // Recheck its bottom footprint so steep terrain cannot leave a gap underneath it.
    for(let pass=0;pass<6;pass++) {
      let nextDepth=depth;
      for(const corner of support) {
        const ground=landscapeWorldHeight(x+corner.x,globalAlong-corner.z+depth*upZ);
        nextDepth=Math.max(nextDepth,depth+(floor+corner.y-depth*upY-ground+0.12)/upY);
      }
      if(nextDepth-depth<0.0001)break;
      depth=nextDepth;
    }
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
