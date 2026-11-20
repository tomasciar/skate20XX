import {worldUnits} from '../../units.ts';
import type {Vector3} from 'three';

export const NITRO={duration:2,recharge:6,acceleration:worldUnits(42)} as const;
export type NitroState={active:boolean;remaining:number;cooldown:number};

/** Follow the board's length along the riding plane, choosing the downhill end in either stance. */
export function nitroHeading(forward:Vector3,downhill:Vector3,normal:Vector3,out:Vector3) {
  out.copy(forward).addScaledVector(normal,-forward.dot(normal));
  // A vertical board has no useful direction along the course plane.
  if(out.lengthSq()<.01)out.copy(downhill).addScaledVector(normal,-downhill.dot(normal));
  out.normalize();
  if(out.dot(downhill)<0)out.negate();
  return out;
}

/** A press starts one boost. Repeated presses never stack or queue during recharge. */
export function createNitro() {
  const state:NitroState={active:false,remaining:0,cooldown:0};
  function reset(){state.active=false;state.remaining=state.cooldown=0;}
  function cancel(){state.active=false;state.remaining=0;}
  function step(dt:number,pressed:boolean) {
    dt=Math.max(0,dt);
    const started=pressed && state.cooldown<=0 && dt>0;
    if(started){state.remaining=NITRO.duration;state.cooldown=state.remaining+NITRO.recharge;}
    const powered=Math.min(dt,state.remaining);
    state.remaining=Math.max(0,state.remaining-dt);state.cooldown=Math.max(0,state.cooldown-dt);
    if(state.remaining<1e-8)state.remaining=0;if(state.cooldown<1e-8)state.cooldown=0;
    state.active=state.remaining>0;
    return powered*NITRO.acceleration;
  }
  return {state,step,reset,cancel};
}
