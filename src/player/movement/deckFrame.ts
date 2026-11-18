import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';

type BoardFrame={
  position:THREE.Vector3;
  rotation:THREE.Quaternion;
  up:THREE.Vector3;
  forward:THREE.Vector3;
  airOffset:THREE.Vector3;
};

/** Align the physical board with support and blend its launch/grind orientation into aerial motion. */
export function createDeckFrame(body:RAPIER.RigidBody,courseForward:THREE.Vector3,courseNormal:THREE.Vector3,
  airRotation:THREE.Quaternion,frame:BoardFrame) {
  const {position,rotation:quat,up:boardUp,forward,airOffset}=frame;
  const pivot=new THREE.Vector3(0,.5,0),nextAirOffset=new THREE.Vector3(),rotatedPivot=new THREE.Vector3();
  const deckForward=new THREE.Vector3(),deckRight=new THREE.Vector3(),deckBack=new THREE.Vector3();
  const deckBasis=new THREE.Matrix4(),deckRotation=new THREE.Quaternion();
  const deckTilt=new THREE.Quaternion(),settle=new THREE.Quaternion(),settled=new THREE.Quaternion();
  const tiltAxis=new THREE.Vector3(1,0,0),inverseLaunch=new THREE.Quaternion();
  let deckPitch=0,resettle=false,launchSettle=false,settleRate=10;
  function reset() {deckPitch=0;resettle=launchSettle=false;settleRate=10;settle.identity();}
  function step(dt:number) {
    if(Math.abs(settle.w)>0.9999999)settle.identity();
    else settle.slerp(settled,1-Math.exp(-settleRate*dt));
  }
  // The next alignment captures the current orientation before switching support planes.
  function preserveLaunchAngle() {resettle=true;launchSettle=true;settleRate=4;}
  function setGrindPitch(pitch:number,transition:boolean) {
    deckPitch=pitch;
    if(transition){resettle=true;settleRate=10;launchSettle=false;}
  }
  function land() {
    if(launchSettle){settle.identity();resettle=launchSettle=false;settleRate=10;}
  }
  /** Keep the deck planted on whatever surface the wheels are on. */
  function apply(yaw:number,up:THREE.Vector3,rotateInAir:boolean) {
    const n = up;
    const f = deckForward.copy(courseForward).applyAxisAngle(courseNormal, yaw);
    f.addScaledVector(n, -f.dot(n));
    if (f.lengthSq() < 1e-6) f.copy(courseForward);
    f.normalize();
    const r = deckRight.crossVectors(f, n).normalize();
    const basis = deckBasis.makeBasis(r, n, deckBack.copy(f).negate());
    const q = deckRotation.setFromRotationMatrix(basis);
    if (deckPitch) q.multiply(deckTilt.setFromAxisAngle(tiltAxis, deckPitch));
    if (resettle) { settle.copy(q).invert().multiply(quat).normalize(); resettle = false; }
    q.multiply(settle);
    if(rotateInAir) {
      nextAirOffset.copy(pivot).applyQuaternion(q);
      // Input still turns in the course frame while a bank's initial roll eases away.
      if(launchSettle)q.multiply(inverseLaunch.copy(settle).invert()).multiply(airRotation).multiply(settle);
      else q.multiply(airRotation);
      nextAirOffset.sub(rotatedPivot.copy(pivot).applyQuaternion(q));
      // Rotate around the rider's center while the center follows the ballistic trajectory.
      const t=body.translation();
      body.setTranslation({x:t.x+nextAirOffset.x-airOffset.x,y:t.y+nextAirOffset.y-airOffset.y,z:t.z+nextAirOffset.z-airOffset.z},true);
      position.add(nextAirOffset).sub(airOffset);airOffset.copy(nextAirOffset);
    }
    body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    quat.copy(q);
    boardUp.set(0,1,0).applyQuaternion(q);
    forward.set(0,0,-1).applyQuaternion(q);
  }

  return {reset,step,preserveLaunchAngle,setGrindPitch,land,apply};
}
