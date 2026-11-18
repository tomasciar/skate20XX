import * as THREE from 'three';
import {LANDMARK_MATERIALS as M,landmarkBox} from './environments/landmarkParts.ts';
import {SIDE_BUILDING,type SideBuildingSite} from './exploration.ts';
import {CHUNK_LENGTH} from './generation.ts';
import {hasRoofLaunch} from './roofPlan.ts';
import {makeRoofLaunch} from './roofLaunch.ts';

/** Tall, elongated buildings sit wholly outside the road and meet their natural uphill approach. */
type Part={material:THREE.MeshStandardMaterial;size:number[];at:number[];decorative:boolean;name?:string};
function planParts(site:SideBuildingSite) {
  const parts:Part[]=[],base=site.owner*CHUNK_LENGTH;
  const start=site.start-base,end=site.end-base,length=end-start,center=(start+end)/2;
  const {near,far}=SIDE_BUILDING,cx=(near+far)/2,roofY=.5+site.height;
  const box=(material:THREE.MeshStandardMaterial,size:number[],at:number[],decorative=false)=>{
    const part:Part={material,size,at:[at[0]!*site.side,at[1]!,at[2]!],decorative};parts.push(part);return part;
  };
  const shell=box(M.brick,[far-near-.6,site.height+3.35,length-.4],[cx,(site.height-2.65)/2,-center]);shell.name='hillside-building';
  const deck=box(M.roof,[far-near,.24,length],[cx,roofY-.12,-center]);deck.name='hillside-roof';
  box(M.concrete,[far-near-.3,3.6,length],[cx,-1.2,-center],true);
  box(M.trim,[.18,.4,length],[far-.1,roofY+.18,-center]);
  const floors=Math.floor(site.height/3);
  const floorStride=site.height>24?2:1;
  for(let s=start+4;s<end-3;s+=12) {
    box(M.concrete,[.22,site.height,.3],[near+.2,site.height/2,-s],true);
    box(M.concrete,[.18,site.height,.28],[far-.2,site.height/2,-s],true);
    for(let floor=0;floor<floors;floor+=floorStride) {
      const bandFloors=Math.min(floorStride,floors-floor);
      const y=2+floor*3+(bandFloors-1)*1.5,windowHeight=bandFloors===2?4.45:1.85;
      for(const face of [-1,1]) {
        const x=face<0?near+.23:far-.23,offset=face*.07;
        box(M.dark,[.1,windowHeight,9.8],[x,y,-s-5.5],true);
        box(M.glass,[.04,windowHeight-.25,9.5],[x+offset,y,-s-5.5],true);
        for(const z of [-3,0,3])box(M.trim,[.06,windowHeight-.15,.07],[x+offset*1.5,y,-s-5.5+z],true);
        box(M.trim,[.16,.12,10.1],[x+offset,y-windowHeight/2-.05,-s-5.5],true);
      }
    }
  }
  // Setbacks give the long roof a readable skyline while keeping its inner 13 metres open to ride.
  const towerLength=Math.min(42,length*.24),towerAlong=start+length*.6;
  box(M.concrete,[5.8,site.height+6,towerLength],[far-3.2,(site.height+6)/2,-towerAlong]);
  box(M.roof,[6.2,.22,towerLength+.4],[far-3.2,site.height+6.1,-towerAlong]);
  for(let y=3;y<site.height+5;y+=3)for(const s of [-towerLength*.3,0,towerLength*.3]) {
    box(M.dark,[.09,1.75,5.8],[far-6.15,y,-towerAlong+s],true);
    box(M.glass,[.04,1.5,5.5],[far-6.22,y,-towerAlong+s],true);
  }
  for(const front of [true,false]) {
    const z=front?-start-.1:-end+.1,sign=front?1:-1;
    for(const x of [near+3,near+8,near+13,near+17])for(let y=2;y<site.height;y+=3) {
      box(M.dark,[2.4,1.8,.08],[x,y,z],true);
      box(M.glass,[2.15,1.55,.035],[x,y,z+sign*.07],true);
      box(M.trim,[2.5,.1,.18],[x,y-.95,z+sign*.08],true);
    }
  }
  // Modest rooftop seams use shared finishes; no lights, textures or separate trigger bodies.
  for(const x of [near+3,near+7,near+11])box(M.steel,[.025,.016,length-.5],[x,roofY+.009,-center],true);
  return parts;
}

/** Long facades are constructed in small batches by the chunk generator. */
export function* makeSideBuildingSteps(site:SideBuildingSite) {
  for(const part of planParts(site)) {
    const mesh=landmarkBox(part.material,part.size,part.at,part.decorative,true);
    if(part.name)mesh.name=part.name;yield mesh;
  }
  if(hasRoofLaunch(site.owner,SIDE_BUILDING.firstOwner,SIDE_BUILDING.period))
    yield makeRoofLaunch(site.owner,site.end,site.side*(SIDE_BUILDING.near+5),.5+site.height);
}
export function makeSideBuilding(site:SideBuildingSite) {return [...makeSideBuildingSteps(site)];}
