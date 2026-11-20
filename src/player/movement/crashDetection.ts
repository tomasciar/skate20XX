import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {isLooseProp,isSolidObstacle,strikeLooseProp} from '../../world/physics/looseProps.ts';
import {BOARD_MASS} from './boardPhysics.ts';

/** Obstruction queries and impact thresholds; the coordinator decides when each query runs. */
export function createCrashDetection(world:RAPIER.World,body:RAPIER.RigidBody,boardCollider:RAPIER.Collider,
  surfaceNormal:THREE.Vector3,position:THREE.Vector3,velocity:THREE.Vector3) {
  const obstacleDirection=new THREE.Vector3(),obstacleNormal=new THREE.Vector3(),landingNormal=new THREE.Vector3();
  const landingProbe=new THREE.Vector3(),landingDown=surfaceNormal.clone().negate();
  const obstacleRay=new RAPIER.Ray(position,obstacleDirection),landingRay=new RAPIER.Ray(landingProbe,landingDown);
  function obstacleAhead(dt:number,speed:number,allowsWall?:(n:THREE.Vector3)=>boolean) {
    if (velocity.length() < 4.5) return false;
    obstacleDirection.copy(velocity).normalize();
    const ray=obstacleRay,length=.4+speed*dt;
    let hit = world.castRayAndGetNormal(ray,length,true,undefined,undefined,undefined,body);
    if(hit && isLooseProp(hit.collider)) {
      strikeLooseProp(hit.collider,velocity,surfaceNormal);
      hit=world.castRayAndGetNormal(ray,length,true,undefined,undefined,undefined,body,isSolidObstacle);
    }
    if (!hit) return false;
    const n = obstacleNormal.set(hit.normal.x,hit.normal.y,hit.normal.z);
    if(allowsWall?.(n))return false;
    return Math.abs(n.dot(surfaceNormal)) < 0.55 && Math.abs(n.dot(velocity)) > 4.5;
  }

  function impactFromContacts(impactVelocity:THREE.Vector3,speed:number,allowsWall?:(n:THREE.Vector3)=>boolean) {
    let hit = false;
    world.contactPairsWith(boardCollider, collider => {
      if(isLooseProp(collider)) {strikeLooseProp(collider,impactVelocity,surfaceNormal);return;}
      world.contactPair(boardCollider, collider, manifold => {
        const n = manifold.normal();
        obstacleNormal.set(n.x,n.y,n.z);if(allowsWall?.(obstacleNormal))return;
        if (Math.abs(n.x*surfaceNormal.x + n.y*surfaceNormal.y + n.z*surfaceNormal.z) > 0.55) return;
        let impulse = 0;
        for (let i=0; i<manifold.numContacts(); i++) impulse += manifold.contactImpulse(i);
        if (impulse > BOARD_MASS * 3.5 || impactVelocity.length() - speed > 4.5) hit = true;
      });
    });
    return hit;
  }

  function invertedLanding(quat:THREE.Quaternion,boardUp:THREE.Vector3) {
    // The wheel rays face away from the road when inverted; probe the rider too.
    for(const height of [0,0.55,1.05]) {
      landingProbe.set(0,height,0).applyQuaternion(quat).add(position).addScaledVector(surfaceNormal,0.15);
      const hit=world.castRayAndGetNormal(landingRay,0.32,true,undefined,undefined,undefined,body,isSolidObstacle);
      if(!hit)continue;
      const normal=landingNormal.set(hit.normal.x,hit.normal.y,hit.normal.z);
      if(normal.dot(surfaceNormal)>0.4 && velocity.dot(normal)<-0.1 && boardUp.dot(normal)<0.75) return true;
    }
    return false;
  }

  return {obstacleAhead,impactFromContacts,invertedLanding};
}
