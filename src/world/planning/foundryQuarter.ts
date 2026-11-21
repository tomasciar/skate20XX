import * as THREE from 'three';
import {courseHeight,courseX} from '../terrain/course.ts';
import {RAMP} from '../config.ts';
import type {SceneryExclusion} from '../environments/layout.ts';

/** A permanent authored opening district. Coordinates are source units, independent of ride mode. */
export const FOUNDRY={start:210,end:600,garageX:88,garageAlong:475,radius:21,rampWidth:8,turns:2,rise:9.2,outerRadius:32,innerRadius:26.8,owner:6} as const;
const angle=RAMP.angleDeg*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
const anchorHeight=courseHeight(FOUNDRY.garageAlong)+.46;
const worldZ=-s*anchorHeight-c*FOUNDRY.garageAlong;
const entryAlong=497,worldY=c*(courseHeight(entryAlong)+.46)-s*entryAlong;
const smooth=(v:number,a:number,b:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};

/** Garage-local horizontal levels to absolute hill-frame coordinates; callers subtract their chunk origin. */
export function foundryPoint(x:number,height:number,forward:number,out=new THREE.Vector3()) {
  const y=worldY+height,z=worldZ-forward;
  return out.set(x+courseX(FOUNDRY.garageAlong),c*y-s*z,s*y+c*z);
}
export function spiralPoint(t:number,across=0,out=new THREE.Vector3()) {
  const theta=Math.PI/2+t*Math.PI*2*FOUNDRY.turns,r=FOUNDRY.radius+across;
  return foundryPoint(FOUNDRY.garageX+r*Math.cos(theta),.03+FOUNDRY.rise*t,r*Math.sin(theta),out);
}
/** Inverse of foundryPoint, useful for route following and development previews. */
export function foundryLocal(point:THREE.Vector3,out=new THREE.Vector3()) {
  return out.set(point.x-courseX(FOUNDRY.garageAlong),c*point.y+s*point.z-worldY,worldZ+s*point.y-c*point.z);
}
export const FOUNDRY_DRIVEWAY_START=475;
const drivewayEnd=foundryPoint(124,.03,21),drivewayAlong=-drivewayEnd.z;
const drivewayHeight=courseHeight(FOUNDRY_DRIVEWAY_START)+.46+.2*Math.sin(Math.PI*(FOUNDRY_DRIVEWAY_START-55)/650)**2+.025;
/** Grade the covered street, rotunda and driveway; preserve the main road and the roof banks' riding cores. */
export function foundryTerrain(height:number,x:number,along:number) {
  if(along<185||along>600)return height;
  // The covered street is a real graded strip. Preserve the tall roof approach outside it.
  if(x< -12&&x> -30&&along<380) {
    const weight=smooth(-x,12,16)*(1-smooth(-x,24,30))*smooth(along,185,210)*(1-smooth(along,350,380));
    height+=(courseHeight(along)+.46-height)*weight;
  }
  if(along>=395&&along<=550&&x>=52&&x<=126) {
    const weight=smooth(x,52,58)*(1-smooth(x,120,126))*smooth(along,395,425)*(1-smooth(along,525,550));
    height+=((worldY-.015+s*along)/c-height)*weight;
  }
  // Grade the visible driveway into the road bed, so its low slab cannot become a raised edge across a lane.
  if(along>=FOUNDRY_DRIVEWAY_START&&along<=drivewayAlong&&x>=113&&x<=153) {
    const t=(along-FOUNDRY_DRIVEWAY_START)/(drivewayAlong-FOUNDRY_DRIVEWAY_START),center=142+(124-142)*t;
    const weight=(1-smooth(Math.abs(x-center),6.5,11))*smooth(along,FOUNDRY_DRIVEWAY_START,FOUNDRY_DRIVEWAY_START+4)*(1-smooth(along,drivewayAlong-4,drivewayAlong));
    height+=(drivewayHeight+(drivewayEnd.y-drivewayHeight)*t-.015-height)*weight;
  }
  return height;
}
export function foundryForChunk(index:number){return index*70<FOUNDRY.end&&(index+1)*70>FOUNDRY.start;}
export function foundryExclusions(index:number):SceneryExclusion[] {
  const from=index*70;
  // Reserve actual circulation and footprints. Background lots remain populated, so the
  // quarter has a surrounding town rather than an enormous empty clearing.
  return [
    {minX:-30,maxX:-11.5,start:210-from,end:318-from},
    {minX:-50,maxX:-13,start:312-from,end:380-from},
    {minX:11.5,maxX:58,start:210-from,end:550-from},
    {minX:50,maxX:126,start:425-from,end:550-from},
    {minX:113,maxX:153,start:475-from,end:502-from},
  ];
}
