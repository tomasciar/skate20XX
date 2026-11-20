import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {WHEEL_BOTTOM,WHEEL_MOUNTS} from '../dimensions.ts';
import {isSolidObstacle} from '../../world/physics/looseProps.ts';

/** Fit visible wheel bottoms to the surface without changing physical support or landing state. */
export function createSurfaceSupport(world:RAPIER.World,body:RAPIER.RigidBody,surfaceNormal:THREE.Vector3) {
  let visualHeightOffset=-0.11;
  const supportPoints = WHEEL_MOUNTS.map(()=>new THREE.Vector3());
  const supportUp = new THREE.Vector3(), supportDown = new THREE.Vector3(),averageNormal=new THREE.Vector3();
  const supportCandidate = new THREE.Vector3(), supportOrigin = new THREE.Vector3();
  const supportAcross = new THREE.Vector3(), supportAlong = new THREE.Vector3(), supportPlane = new THREE.Vector3();
  const supportForward = new THREE.Vector3(), supportRight = new THREE.Vector3(), supportDelta = new THREE.Vector3();
  const supportBasis = new THREE.Matrix4(), supportRotation = new THREE.Quaternion();
  const supportRay=new RAPIER.Ray(supportOrigin,supportDown);
  function fit(at:THREE.Vector3,renderQuat:THREE.Quaternion,boardUp:THREE.Vector3) {
    // Re-sample after fitting the board plane: pitching around a ramp seam shifts wheel positions.
    for (let pass = 0; pass < 3; pass++) {
      let contactCount = 0;averageNormal.set(0,0,0);
      const currentUp = supportUp.set(0,1,0).applyQuaternion(renderQuat);
      const down = supportDown.copy(currentUp).negate();
      const candidate = supportCandidate.copy(at).addScaledVector(currentUp, visualHeightOffset);
      for (const m of WHEEL_MOUNTS) {
        const origin = supportOrigin.set(m.x,0.25,m.z).applyQuaternion(renderQuat).add(candidate);
        const hit = world.castRayAndGetNormal(supportRay, 0.65, true, undefined, undefined, undefined, body,isSolidObstacle);
        if(!hit)continue;supportDelta.set(hit.normal.x,hit.normal.y,hit.normal.z);
        if(supportDelta.dot(surfaceNormal)<.4 && supportDelta.dot(boardUp)<.8)continue;
        averageNormal.add(supportDelta);
        supportPoints[contactCount++]!.copy(origin).addScaledVector(down,hit.timeOfImpact);
      }
      if (contactCount < 2) return;
      let up = currentUp;
      if (contactCount === 4) {
        const across = supportAcross.copy(supportPoints[1]!).sub(supportPoints[0]!).add(supportPoints[3]!).sub(supportPoints[2]!);
        const along = supportAlong.copy(supportPoints[2]!).add(supportPoints[3]!).sub(supportPoints[0]!).sub(supportPoints[1]!);
        const planeUp = supportPlane.crossVectors(along, across).normalize();
        if (planeUp.dot(boardUp) > 0.8 && planeUp.dot(averageNormal.normalize())>.985) up = planeUp;
      }
      const f = supportForward.set(0,0,-1).applyQuaternion(renderQuat);
      f.addScaledVector(up, -f.dot(up)).normalize();
      const right = supportRight.crossVectors(f, up).normalize();
      supportRotation.setFromRotationMatrix(supportBasis.makeBasis(right,up,f.negate()));
      const rotationChange = renderQuat.angleTo(supportRotation);
      renderQuat.copy(supportRotation);
      // Use the highest support plane so no supported wheel penetrates the surface.
      let correction = -Infinity;
      for(let i=0;i<contactCount;i++) correction=Math.max(correction,-WHEEL_BOTTOM-supportDelta.copy(at).sub(supportPoints[i]!).dot(up));
      const fitted = THREE.MathUtils.clamp(correction,-0.25,0.1);
      const heightChange = Math.abs(fitted-visualHeightOffset);
      visualHeightOffset = fitted;
      // A settled plane needs one pass. Refit only when a seam changes the contact plane.
      if(rotationChange<1e-5 && heightChange<0.0001) break;
    }
  }

  return {fit,reset(){visualHeightOffset=-0.11;},get heightOffset(){return visualHeightOffset;}};
}
