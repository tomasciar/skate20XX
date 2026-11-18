import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type {SkaterVisual} from '../visuals/skaterVisual.ts';
import {createRagdoll} from './ragdoll.ts';
import {restoreBoardCollider,releaseBoardCollider} from './boardPhysics.ts';

type CrashPhysicsOptions={
  scene:THREE.Scene;
  world:RAPIER.World;
  normal:THREE.Vector3;
  body:RAPIER.RigidBody;
  collider:RAPIER.Collider;
  visual:SkaterVisual;
};

/** Own the physical rider/loose-board transition, interpolation and rebasing during a crash. */
export function createCrashPhysics({scene,world,normal,body,collider,visual}:CrashPhysicsOptions) {
  const ragdoll=createRagdoll(scene,world);
  const previousPosition=new THREE.Vector3(),previousRotation=new THREE.Quaternion();
  const renderPosition=new THREE.Vector3(),renderRotation=new THREE.Quaternion();
  function rememberBoardPose() {
    const t=body.translation(),q=body.rotation();
    previousPosition.set(t.x,t.y,t.z);previousRotation.set(q.x,q.y,q.z,q.w);
  }
  function clear() {
    ragdoll.clear();visual.setRagdoll(false);restoreBoardCollider(collider);
  }
  function capture(momentum:THREE.Vector3) {
    const rig=visual.captureRagdoll();
    const releasedBoard=visual.board.getWorldPosition(new THREE.Vector3());
    const releasedRotation=visual.board.getWorldQuaternion(new THREE.Quaternion());
    body.setTranslation(releasedBoard,true);body.setRotation(releasedRotation,true);
    ragdoll.start(rig,momentum,normal);visual.setRagdoll(true);
    visual.board.position.set(0,0,0);visual.board.rotation.set(0,0,0);
  }
  function releaseBoard() {
    releaseBoardCollider(collider);
    body.setAngvel({x:3,y:0.5,z:1.5},true);rememberBoardPose();
  }
  function beginStep() {ragdoll.beginStep();rememberBoardPose();}
  function shift(delta:THREE.Vector3) {
    const t=body.translation();
    body.setTranslation({x:t.x+delta.x,y:t.y+delta.y,z:t.z+delta.z},true);
    previousPosition.add(delta);ragdoll.shift(delta);
  }
  function render(alpha:number) {
    ragdoll.render(THREE.MathUtils.clamp(alpha,0,1));
    const t=body.translation(),q=body.rotation();
    visual.root.position.lerpVectors(previousPosition,renderPosition.set(t.x,t.y,t.z),alpha);
    visual.root.quaternion.slerpQuaternions(previousRotation,renderRotation.set(q.x,q.y,q.z,q.w),alpha);
  }
  return {clear,capture,releaseBoard,beginStep,shift,render,sync:ragdoll.sync,focus:ragdoll.focus,velocity:ragdoll.velocity,
    get active(){return ragdoll.active;}};
}
