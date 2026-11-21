import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {makeCar} from '../props/vehicles.ts';
import {seededRandom} from '../planning/generation.ts';
import {landscapeHeight} from '../terrain/landscape.ts';
import {courseHeight,courseX} from '../terrain/course.ts';
import {bakeSceneryCollision} from './collision.ts';
import {batchChunk} from '../rendering/batching.ts';
import type {createWorldAppearance} from '../rendering/appearance.ts';

/** Two slow parking maneuvers in the service court; they never enter the main road or warehouse landing lane. */
export function makeQuarterTraffic(index:number) {
  const along=index===6?465:index===7?535:null;if(along===null)return null;
  const mesh=makeCar(seededRandom(900+index));
  mesh.userData.looseProp=true;mesh.userData.collision=false;mesh.userData.quarterTraffic=along;mesh.name='foundry-parking-car';
  return mesh;
}
export function createQuarterTraffic(world:RAPIER.World,mesh:THREE.Group,index:number,appearance:ReturnType<typeof createWorldAppearance>) {
  const along=mesh.userData.quarterTraffic as number,base=index*70;
  let bottom=Infinity;
  const parent=mesh.parent!,at=new THREE.Vector3(),last=new THREE.Vector3(),next=new THREE.Vector3(),inverse=new THREE.Matrix4();
  const heading=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2),parentQ=new THREE.Quaternion();
  const initialTime=index===6?0:Math.PI;
  let time=initialTime;
  function position(out:THREE.Vector3) {
    const x=35.5+Math.sin(time*.6)*1.4;
    parent.updateWorldMatrix(true,false);
    out.set(x+courseX(along)-courseX(base),landscapeHeight(x,along)-courseHeight(base)+.02,-(along-base)).applyMatrix4(parent.matrixWorld);
    out.y-=bottom;return out;
  }
  // Bake the local visible car, then merge its static components to keep animated draw calls bounded.
  delete mesh.userData.collision;
  const solid=bakeSceneryCollision(mesh)!;mesh.userData.collision=false;
  for(let i=1;i<solid.vertices.length;i+=3)bottom=Math.min(bottom,solid.vertices[i]!);
  for(const _ of batchChunk(mesh,appearance)){void _;}
  position(at);last.copy(at);next.copy(at);
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x,at.y,at.z).setRotation(heading));
  world.createCollider(RAPIER.ColliderDesc.trimesh(solid.vertices,solid.indices),body);
  function render(alpha:number) {
    parent.updateWorldMatrix(true,false);inverse.copy(parent.matrixWorld).invert();
    mesh.position.copy(next.lerpVectors(last,at,alpha)).applyMatrix4(inverse);
    parent.getWorldQuaternion(parentQ).invert();mesh.quaternion.copy(parentQ).multiply(heading);mesh.updateMatrix();
  }
  render(1);
  return {body,mesh,
    step(dt:number){last.copy(at);time+=Math.max(0,dt);position(at);body.setNextKinematicTranslation(at);},
    sync(){const p=body.translation();at.set(p.x,p.y,p.z);},render,
    shift(delta:THREE.Vector3){at.add(delta);last.add(delta);next.add(delta);body.setTranslation(at,false);body.setNextKinematicTranslation(at);},
    reset(){time=initialTime;position(at);last.copy(at);body.setTranslation(at,false);body.setNextKinematicTranslation(at);render(1);},
    dispose(){world.removeRigidBody(body);},
  };
}
export type QuarterTraffic=ReturnType<typeof createQuarterTraffic>;
