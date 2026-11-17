import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

type ConeData={knockable:'cone';struck:boolean};
function coneData(collider:RAPIER.Collider) {
  const data=collider.parent()?.userData as ConeData|undefined;
  return data?.knockable==='cone'?data:undefined;
}
export const isLooseProp=(collider:RAPIER.Collider)=>!!coneData(collider);
export const isSolidObstacle=(collider:RAPIER.Collider)=>!isLooseProp(collider);

/** Add a little lift/tumble so a light plastic cone kicks away even at low road speeds. */
export function strikeLooseProp(collider:RAPIER.Collider,velocity:THREE.Vector3,up:THREE.Vector3) {
  const data=coneData(collider),body=collider.parent(),speed=velocity.length();
  if(!data || !body || data.struck || speed<1)return;
  data.struck=true;
  const launch=velocity.clone().multiplyScalar(.8).addScaledVector(up,Math.min(8,1.5+speed*.12));
  body.setLinvel(launch,true);
  const spin=new THREE.Vector3().crossVectors(up,velocity).normalize().multiplyScalar(Math.min(16,4+speed*.18));
  spin.addScaledVector(up,2);body.setAngvel(spin,true);
}

/** One cheap convex collider per cone, with the same chunk lifetime as its scenery. */
export function createLooseCone(world:RAPIER.World,mesh:THREE.Object3D) {
  mesh.updateWorldMatrix(true,false);
  const position=mesh.getWorldPosition(new THREE.Vector3()),rotation=mesh.getWorldQuaternion(new THREE.Quaternion());
  const previous=position.clone(),previousRotation=rotation.clone();
  const initialPosition=position.clone(),initialRotation=rotation.clone();
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(position.x,position.y,position.z).setRotation(rotation)
    .setCanSleep(true).setSleeping(true).setCcdEnabled(true).setLinearDamping(.12).setAngularDamping(.5));
  body.userData={knockable:'cone',struck:false} satisfies ConeData;
  const points:number[]=[];
  for(const y of [0,.06])for(const x of [-.25,.25])for(const z of [-.25,.25])points.push(x,y,z);
  for(let i=0;i<10;i++)points.push(Math.cos(i*Math.PI/5)*.2,.055,Math.sin(i*Math.PI/5)*.2);
  points.push(0,.705,0);
  const collider=world.createCollider(RAPIER.ColliderDesc.convexHull(new Float32Array(points))!
    .setMass(.8).setFriction(.85).setRestitution(.15),body);
  // Adding a collider wakes its body; keep untouched cones out of the active solver.
  body.sleep();
  const at=new THREE.Vector3(),orientation=new THREE.Quaternion(),inverse=new THREE.Matrix4(),parentRotation=new THREE.Quaternion();
  function sync() {
    previous.copy(position);previousRotation.copy(rotation);
    const p=body.translation(),q=body.rotation();position.set(p.x,p.y,p.z);rotation.set(q.x,q.y,q.z,q.w);
  }
  function render(alpha:number) {
    const parent=mesh.parent;
    if(!parent)return;
    parent.updateWorldMatrix(true,false);inverse.copy(parent.matrixWorld).invert();
    mesh.position.copy(at.lerpVectors(previous,position,alpha)).applyMatrix4(inverse);
    parent.getWorldQuaternion(parentRotation).invert();
    mesh.quaternion.copy(parentRotation).multiply(orientation.slerpQuaternions(previousRotation,rotation,alpha));
    mesh.updateMatrix();
  }
  function shift(delta:THREE.Vector3) {
    previous.add(delta);position.add(delta);initialPosition.add(delta);
    body.setTranslation(position,false);
  }
  function reset() {
    position.copy(initialPosition);previous.copy(position);rotation.copy(initialRotation);previousRotation.copy(rotation);
    body.setTranslation(position,false);body.setRotation(rotation,false);
    body.setLinvel({x:0,y:0,z:0},false);body.setAngvel({x:0,y:0,z:0},false);
    body.userData={knockable:'cone',struck:false} satisfies ConeData;
    body.sleep();render(1);
  }
  return {mesh,body,collider,sync,render,shift,reset,dispose(){world.removeRigidBody(body);}};
}
export type LooseCone=ReturnType<typeof createLooseCone>;
