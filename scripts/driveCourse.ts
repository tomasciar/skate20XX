import * as THREE from 'three';
import { carveTurnRate } from '../src/player/movement/carve.ts';
import type { BoardPlayer } from '../src/player/board.ts';
import type { RampWorld } from '../src/world/ramp.ts';

const direction=new THREE.Vector3();
const projected=new THREE.Vector3();
/** Simple driver for headless tests/benchmarks. The game always uses the player's steering input. */
export function steerAlongCourse(player: BoardPlayer, ramp: RampWorld) {
  if(player.airborne || player.crashed || player.grind.active || !ramp.directionAt || !ramp.roadOffset)return 0;
  const lookAhead=Math.max(25,player.speed*0.5);
  ramp.directionAt(player.position,direction,lookAhead);
  const target=Math.atan2(-direction.x,direction.dot(ramp.forward))+Math.atan2(ramp.roadOffset(player.position),lookAhead);
  const current=Math.atan2(-player.forward.x,player.forward.dot(ramp.forward));
  const error=Math.atan2(Math.sin(target-current),Math.cos(target-current));
  return THREE.MathUtils.clamp(-error*3/carveTurnRate(player.speed),-1,1);
}

/** Test jumps need a clear ballistic line; there is no lateral air steering to follow a bend. */
export function canJumpOnCourse(player: BoardPlayer, ramp: RampWorld) {
  if(!player.grounded || !ramp.roadOffset)return false;
  for(let time=0.2;time<=1.6;time+=0.2) {
    projected.copy(player.position).addScaledVector(player.velocity,time);
    projected.y-=9*time*time;
    if(Math.abs(ramp.roadOffset(projected))>1.5)return false;
  }
  return true;
}
