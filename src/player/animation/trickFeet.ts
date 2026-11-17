import type { TrickId } from '../tricks/tricks.ts';

export type TrickFootPose = { x: number; y: number; z: number; pitch: number; yaw: number; roll: number };
type Flick = Omit<TrickFootPose,'y'>;
const flick=(x=0,z=0,pitch=0,yaw=0,roll=0):Flick=>({x,z,pitch,yaw,roll});
// Rider space: left/front foot is -X, toe edge is -Z. The rear foot scoops the tail.
const STYLES:Record<TrickId,{front:Flick;rear:Flick}>={
  kickflip:{front:flick(-0.09,-0.20,-0.45,0,0.18),rear:flick(0.025,0.025,0.1,-0.08)},
  heelflip:{front:flick(-0.08,0.20,0.45,0,-0.18),rear:flick(0.025,-0.025,0.1,0.08)},
  shoveit:{front:flick(-0.02,0.06,-0.08,0.12),rear:flick(0.07,-0.20,-0.18,-0.4)},
  fs180:{front:flick(-0.04,0.11,0,0.3,0.1),rear:flick(0.10,-0.13,-0.1,-0.45)},
  varial:{front:flick(-0.08,-0.18,-0.4,0,0.15),rear:flick(0.07,-0.16,-0.2,-0.35)},
  hardflip:{front:flick(-0.07,-0.19,-0.45,0,0.18),rear:flick(0.08,0.18,0.15,0.4)},
};
function smooth(start:number,end:number,value:number) {
  const u=Math.max(0,Math.min(1,(value-start)/(end-start)));
  return u*u*(3-2*u);
}

/** One flick/scoop, clearance while the deck spins, then a catch. Caller reuses `out` each frame. */
export function sampleTrickFoot(id:TrickId,progress:number,side:number,out:TrickFootPose) {
  out.x=out.y=out.z=out.pitch=out.yaw=out.roll=0;
  if(progress<=0 || progress>=1)return;
  const front=side<0,style=front?STYLES[id].front:STYLES[id].rear;
  const action=Math.sin(Math.PI*smooth(front?0.04:0.02,front?0.62:0.54,progress));
  const lift=smooth(0,0.12,progress)*(1-smooth(0.65,1,progress));
  out.x=style.x*action;out.z=style.z*action;
  out.y=(front?0.24:0.20)*lift+0.025*action;
  out.pitch=style.pitch*action;out.yaw=style.yaw*action;out.roll=style.roll*action;
}
