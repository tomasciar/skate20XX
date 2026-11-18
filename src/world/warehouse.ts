import * as THREE from 'three';
import {CHUNK_LENGTH} from './generation.ts';
import {createRampShapeGeometry} from './rampShapes.ts';
import {LANDMARK_MATERIALS as M,landmarkBox,landmarkPart} from './environments/landmarkParts.ts';

import {WAREHOUSE} from './warehouseSite.ts';
import {hasRoofLaunch} from './roofPlan.ts';
import {makeRoofLaunch} from './roofLaunch.ts';
export {WAREHOUSE,warehouseSiteAt} from './warehouseSite.ts';

/** A roadside depot with a brick plinth, inset loading bays, clerestory glazing and a clear roof. */
export function makeLongWarehouse(owner:number) {
  const meshes:THREE.Mesh[]=[];
  const box=(material:THREE.MeshStandardMaterial,size:number[],at:number[],decorative=false)=>{
    const mesh=landmarkBox(material,size,at,decorative,true);meshes.push(mesh);return mesh;
  };
  const {start,end,near,far,height}=WAREHOUSE,length=end-start,center=(start+end)/2,cx=(near+far)/2,roofY=.5+height;
  const shell=box(M.brick,[far-near-.8,height+.35,length-.4],[cx,(height+.35)/2,-center]);shell.name='long-warehouse';
  box(M.concrete,[far-near-.5,.55,length-.2],[cx,.28,-center],true);
  const deck=box(M.roof,[far-near,.24,length],[cx,roofY-.12,-center]);deck.name='warehouse-roof';
  box(M.trim,[.18,.32,length],[far-.1,roofY+.15,-center]);
  box(M.dark,[.2,.14,length],[near+.05,roofY-.3,-center],true);
  // Thin standing seams read as roof construction, with a shallow and predictable landing plane.
  for(let x=near+1;x<far;x+=2.4)box(M.steel,[.035,.018,length-.4],[x,roofY+.01,-center],true);
  for(let s=start+3;s<end-3;s+=8) {
    const bay=s+3.5;
    box(M.concrete,[.22,height+.08,.28],[near+.28,(height+.08)/2,-s],true);
    box(M.dark,[.085,2.35,5.5],[near+.36,1.48,-bay],true);
    box(M.steel,[.045,2.1,5.15],[near+.3,1.48,-bay],true);
    for(let y=.7;y<2.4;y+=.34)box(M.concrete,[.035,.04,5.05],[near+.26,y,-bay],true);
    box(M.trim,[.2,.14,5.65],[near+.25,2.76,-bay],true);
    box(M.dark,[.08,.94,6.8],[near+.35,3.5,-bay],true);
    box(M.glass,[.035,.73,6.5],[near+.29,3.5,-bay],true);
    for(const dz of [-2.2,0,2.2])box(M.trim,[.06,.82,.06],[near+.25,3.5,-bay+dz],true);
    box(M.trim,[.23,.11,7.02],[near+.24,3,-bay],true);
    // Utility details sit on the outer roof edge, clear of the jumping/landing area.
    if((s-start-3)%24===0) {
      box(M.steel,[1.5,.7,3.2],[far-.9,roofY+.35,-bay]);
      box(M.trim,[1.7,.12,3.4],[far-.9,roofY+.75,-bay],true);
      for(let v=0;v<5;v++)box(M.dark,[1.2,.055,3.22],[far-.9,roofY+.15+v*.12,-bay],true);
    }
  }
  for(let s=start+7;s<end-5;s+=16) {
    box(M.concrete,[.2,height+.1,.22],[far-.31,(height+.1)/2,-s],true);
    box(M.dark,[.08,.95,7],[far-.36,3.45,-s-4],true);
    box(M.glass,[.04,.72,6.7],[far-.3,3.45,-s-4],true);
  }
  for(const front of [true,false]) {
    const z=front?-start-.14:-end+.14,sign=front?1:-1;
    for(const x of [near+3,near+8.5]) {
      box(M.dark,[3.4,2.55,.08],[x,1.6,z],true);
      box(M.steel,[3.16,2.3,.04],[x,1.6,z+sign*.06],true);
      for(let y=.7;y<2.6;y+=.35)box(M.concrete,[3,.035,.025],[x,y,z+sign*.09],true);
      box(M.glass,[3.3,.6,.035],[x,3.5,z+sign*.06],true);
      box(M.trim,[3.5,.12,.16],[x,3.1,z+sign*.09],true);
    }
  }
  // An attached corner office breaks up the long shed silhouette without narrowing the roof line.
  box(M.concrete,[4.4,6.6,13],[far-2.6,3.3,-start-6.5]);
  box(M.roof,[4.8,.22,13.4],[far-2.6,6.68,-start-6.5]);
  for(const x of [far-3.65,far-1.5])for(const y of [2,4.7]) {
    box(M.dark,[1.95,1.65,.08],[x,y,-start+.15],true);
    box(M.glass,[1.72,1.4,.035],[x,y,-start+.21],true);
    box(M.trim,[2.02,.1,.19],[x,y-.86,-start+.23],true);
  }
  box(M.dark,[1.2,2.5,.1],[far-5.9,1.4,-start-.14],true);
  box(M.steel,[3.3,.16,1.5],[far-5.7,2.85,-start+.45]);
  box(M.concrete,[3.3,.2,1.4],[far-5.7,.28,-start+.45]);
  // Separate loading ramp: its lip ends six metres before the facade and points toward the roof.
  const rampLength=WAREHOUSE.rampEnd-WAREHOUSE.rampStart;
  const ramp=createRampShapeGeometry({kind:'curved',side:1,width:WAREHOUSE.rampWidth,length:rampLength,height:WAREHOUSE.rampHeight},owner*CHUNK_LENGTH+WAREHOUSE.rampStart);
  const p=ramp.getAttribute('position');
  for(let i=0;i<p.count;i++) {
    const t=(rampLength/2-p.getZ(i))/rampLength;
    p.setXYZ(i,p.getX(i)+WAREHOUSE.rampX+t*(WAREHOUSE.rampExitX-WAREHOUSE.rampX),p.getY(i)+.5,p.getZ(i)-(WAREHOUSE.rampStart+WAREHOUSE.rampEnd)/2);
  }
  ramp.computeVertexNormals();const launch=landmarkPart(ramp,M.concrete);launch.name='warehouse-loading-ramp';meshes.push(launch);
  // The approach shares the road at zero height; render depth bias keeps that join stable.
  // This shared finish also works for foundations, so use a dedicated ramp material only here.
  launch.material=loadingRampMaterial;
  if(hasRoofLaunch(owner,WAREHOUSE.firstChunk,WAREHOUSE.repeatChunks))meshes.push(makeRoofLaunch(owner,owner*CHUNK_LENGTH+end,WAREHOUSE.near+5,roofY));
  return meshes;
}

const loadingRampMaterial=M.concrete.clone();
loadingRampMaterial.polygonOffset=true;loadingRampMaterial.polygonOffsetFactor=-1;loadingRampMaterial.polygonOffsetUnits=-2;
