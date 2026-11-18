import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {BOARD,WHEEL_MOUNTS} from '../dimensions.ts';
import {RIDE_CONTACT} from './rideContact.ts';
import {isSolidObstacle} from '../../world/physics/looseProps.ts';

const REST = 0.16;
const TRAVEL = 0.12;
const WHEEL_R = BOARD.wheelRadius;
const RAY_LEN = REST + TRAVEL + WHEEL_R;
const STIFF = 28000;
const DAMP = 2400;
const OLLIE_GAP=0.05;

type BoardFrame={position:THREE.Vector3;rotation:THREE.Quaternion;up:THREE.Vector3;forward:THREE.Vector3};

/** Sample wheel support and apply spring/grip impulses. The returned buffers are reused each sample. */
export function createSuspension(world:RAPIER.World,body:RAPIER.RigidBody,surfaceNormal:THREE.Vector3,frame:BoardFrame) {
  const {position,rotation:quat,up:boardUp,forward}=frame;
  const mount=new THREE.Vector3(),rayDir=new THREE.Vector3();
  const wheelRay=new RAPIER.Ray(mount,rayDir),departureRay=new RAPIER.Ray(position,rayDir);
  const nearbyNormal=new THREE.Vector3(),rollingNormal=new THREE.Vector3(),contactNormal=new THREE.Vector3();
  const state={wheelsDown:0,nearbyWheels:0,rollingWheels:0,normal:contactNormal,nearbyNormal,rollingNormal};
  function sample(dt:number,leaveGround:number,slideAmount:number) {
    rayDir.copy(boardUp).multiplyScalar(-1);
    let wheelsDown = 0;
    let nearbyWheels = 0;
    let rollingWheels=0;
    nearbyNormal.set(0,0,0);
    rollingNormal.set(0,0,0);
    const contactN = contactNormal.set(0,0,0);
    for (const m of WHEEL_MOUNTS) {
      mount.set(m.x, m.y, m.z).applyQuaternion(quat).add(position);
      const ray = wheelRay;
      const hit = world.castRayAndGetNormal(ray, RAY_LEN, true, undefined, undefined, undefined, body,isSolidObstacle);
      if (!hit) continue;
      const compressed = REST - (hit.timeOfImpact - WHEEL_R);
      const nx = hit.normal.x;
      const ny = hit.normal.y;
      const nz = hit.normal.z;
      const upDot =
        nx * surfaceNormal.x + ny * surfaceNormal.y + nz * surfaceNormal.z;
      if (upDot < 0.4) continue;
      if(compressed>=-RIDE_CONTACT.gap) {
        rollingWheels++;rollingNormal.x+=nx;rollingNormal.y+=ny;rollingNormal.z+=nz;
      }
      if (compressed >= -OLLIE_GAP) {
        nearbyWheels++;
        nearbyNormal.x += nx; nearbyNormal.y += ny; nearbyNormal.z += nz;
      }
      if (compressed <= 0) continue;
      wheelsDown++;
      contactN.x+=nx;contactN.y+=ny;contactN.z+=nz;

      // While popping, the springs would grab the deck and cancel the ollie.
      if (leaveGround > 0) continue;

      const point = ray.pointAt(hit.timeOfImpact);
      const velAt = body.velocityAtPoint(point);
      const vn = velAt.x * nx + velAt.y * ny + velAt.z * nz;
      const force = Math.max(0, compressed * STIFF - vn * DAMP);

      body.applyImpulseAtPoint({ x: nx * force * dt, y: ny * force * dt, z: nz * force * dt }, point, true);

      // Grip is applied at the center of mass so it slows the slide without flipping the deck
      const tx = velAt.x - nx * vn;
      const ty = velAt.y - ny * vn;
      const tz = velAt.z - nz * vn;
      const along = tx * forward.x + ty * forward.y + tz * forward.z;
      const sx = tx - forward.x * along;
      const sy = ty - forward.y * along;
      const sz = tz - forward.z * along;
      const sideMag = Math.hypot(sx, sy, sz);
      if (sideMag > 0.08) {
        const grip = Math.min(sideMag * 18, 40) * dt * (1-slideAmount);
        body.applyImpulse({ x: (-sx / sideMag) * grip, y: (-sy / sideMag) * grip, z: (-sz / sideMag) * grip }, true);
      }
    }

    if (contactN.lengthSq() > 0) contactN.normalize();
    else contactN.copy(surfaceNormal);
    rollingNormal.normalize();
    state.wheelsDown=wheelsDown;state.nearbyWheels=nearbyWheels;state.rollingWheels=rollingWheels;
    return state;
  }
  function isDeparting(surfaceUp:THREE.Vector3) {
    rayDir.copy(surfaceUp).negate();
    const road=world.castRay(departureRay,.6,true,undefined,undefined,undefined,body,isSolidObstacle);
    return !road || road.timeOfImpact>REST+WHEEL_R+.02+.15;
  }
  return {sample,isDeparting};
}
