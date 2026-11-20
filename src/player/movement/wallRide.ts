import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {speedFromMph} from '../../units.ts';
import {isSolidObstacle} from '../../world/physics/looseProps.ts';

export const WALL_RIDE={minSpeed:speedFromMph(35),reach:.38,maxIntoSpeed:6,maxIntoFraction:.26,duration:1.6,fade:.4,adhesion:24,normalRate:12} as const;
const SIDES=[-1,1] as const,PROBES=[[0,-.28],[0,.28],[.85,0]] as const;
type Frame={position:THREE.Vector3;forward:THREE.Vector3;up:THREE.Vector3};

/** Brief assisted wall contact. Gravity stays active; openings, ceilings and head-on impacts never qualify. */
export function createWallRide(world:RAPIER.World,body:RAPIER.RigidBody,courseUp:THREE.Vector3,frame:Frame) {
  const normal=courseUp.clone(),heading=frame.forward.clone(),right=new THREE.Vector3(),travel=new THREE.Vector3();
  const origin=new THREE.Vector3(),direction=new THREE.Vector3(),candidate=new THREE.Vector3(),rotation=new THREE.Quaternion(),gravity=new THREE.Vector3();
  const floorDirection=courseUp.clone().negate(),floorRay=new RAPIER.Ray(frame.position,floorDirection);
  const ray=new RAPIER.Ray(origin,direction),state={active:false,normal,heading,age:0,floorExit:false,floorNormal:courseUp.clone()};
  let cooldown=0,entering=false,floorTime=0;
  function reset(){state.active=false;state.age=0;cooldown=0;entering=false;floorTime=0;state.floorExit=false;normal.copy(courseUp);heading.copy(frame.forward);}
  function release(){if(state.active)cooldown=.2;state.active=false;state.age=0;entering=false;}
  function update(dt:number,velocity:THREE.Vector3,allowed:boolean,queriesReady=true) {
    if(!allowed){floorTime=0;state.floorExit=false;release();return;}
    if(!queriesReady && state.active){state.age+=dt;if(state.age>=WALL_RIDE.duration)release();return;}
    cooldown=Math.max(0,cooldown-dt);
    floorTime=Math.max(0,floorTime-dt);state.floorExit=floorTime>0;
    const floor=world.castRayAndGetNormal(floorRay,.5,true,undefined,undefined,undefined,body,isSolidObstacle);
    const groundBelow=!!floor && floor.normal.x*courseUp.x+floor.normal.y*courseUp.y+floor.normal.z*courseUp.z>.7;
    if(groundBelow && (state.active || state.floorExit)) {
      state.floorNormal.set(floor!.normal.x,floor!.normal.y,floor!.normal.z);
      if(frame.up.dot(state.floorNormal)>.995){floorTime=0;state.floorExit=false;}else {floorTime=.25;state.floorExit=true;}
      release();return;
    }
    const speed=velocity.length();
    if(!allowed || speed<WALL_RIDE.minSpeed || cooldown>0 || state.age>=WALL_RIDE.duration){release();return;}
    if(groundBelow){release();return;}
    travel.copy(velocity).addScaledVector(courseUp,-velocity.dot(courseUp));
    if(travel.lengthSq()<1){release();return;}
    travel.normalize();right.crossVectors(travel,courseUp).normalize();
    let found=false;
    for(const side of SIDES) {
      direction.copy(right).multiplyScalar(side);
      // Multiple heights and longitudinal samples require an actual, broad wall face.
      // A doorway immediately breaks these queries instead of retaining an invisible support plane.
      let samples=0;
      for(const [height,along] of PROBES) {
        origin.copy(frame.position).addScaledVector(courseUp,height).addScaledVector(travel,along);
        const hit=world.castRayAndGetNormal(ray,WALL_RIDE.reach,true,undefined,undefined,undefined,body,isSolidObstacle);
        if(!hit || !hit.collider.parent()?.isFixed())break;
        const n=candidate.set(hit.normal.x,hit.normal.y,hit.normal.z);if(n.lengthSq()<.9)break;
        const upDot=n.dot(courseUp),into=-velocity.dot(n);
        if(upDot<-.08 || upDot>.4 || into < -3 || into>WALL_RIDE.maxIntoSpeed || into>speed*WALL_RIDE.maxIntoFraction)break;
        if(samples && n.dot(normal)<.94)break;
        if(!samples) {
          if(state.active){rotation.setFromUnitVectors(normal,n);heading.applyQuaternion(rotation);}
          else {heading.copy(velocity);if(heading.dot(frame.forward)<0)heading.negate();}
          normal.copy(n);
        }
        samples++;
      }
      if(samples===3){found=true;break;}
    }
    if(!found){release();return;}
    entering=!state.active;state.active=true;state.age+=dt;
    heading.addScaledVector(normal,-heading.dot(normal));
    if(heading.lengthSq()<1e-5)heading.copy(travel).addScaledVector(normal,-travel.dot(normal));
    // Let gravity tip the rolling direction down the wall instead of cancelling its fall with lateral grip.
    gravity.set(world.gravity.x,world.gravity.y,world.gravity.z);gravity.addScaledVector(normal,-gravity.dot(normal));
    heading.addScaledVector(gravity,dt/Math.max(speed,1)).normalize();
  }
  function steer(angle:number){if(state.active)heading.applyAxisAngle(normal,angle).normalize();}
  function pull(dt:number,wheels:number) {
    if(!state.active || wheels<2)return;
    const fade=Math.min(1,(WALL_RIDE.duration-state.age)/WALL_RIDE.fade);
    const impulse=-body.mass()*WALL_RIDE.adhesion*Math.max(0,fade)*dt;
    body.applyImpulse({x:normal.x*impulse,y:normal.y*impulse,z:normal.z*impulse},true);
  }
  function allows(n:THREE.Vector3) {return state.active && Math.abs(n.dot(normal))>.92;}
  return {state,reset,release,update,steer,pull,allows,get entering(){return entering;}};
}
