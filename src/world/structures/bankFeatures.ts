import * as THREE from 'three';
import {terrainBanksForChunk,terrainBankAt,BANK_BOOST} from '../planning/terrainBanks.ts';
import {makeBoostPad} from './startPlatform.ts';
import {makeRoofLaunch} from './roofLaunch.ts';
import {landscapeHeight} from '../terrain/landscape.ts';
import {courseHeight} from '../terrain/course.ts';
import {CHUNK_LENGTH} from '../planning/generation.ts';

/** Only furniture is added here; the banks themselves belong to the continuous landscape. */
export function makeBankFeatures(index:number) {
  const meshes:THREE.Mesh[]=[];
  for(const site of terrainBanksForChunk(index)) {
    if(site.owner!==index)continue;
    if(site.kind==='launch') {
      const launch=makeRoofLaunch(index,site.crestEnd,site.x,.46+site.height);
      launch.name='standalone-bank-kicker';meshes.push(launch);
    }
    if(site.kind==='boost') {
      const pad=makeBoostPad(BANK_BOOST.width,BANK_BOOST.length);
      pad.position.set(site.x,.46+site.height,-((site.crestStart+site.crestEnd)/2-index*CHUNK_LENGTH));pad.updateMatrix();
      for(const child of [...pad.children])if(child instanceof THREE.Mesh) {
        child.applyMatrix4(pad.matrix);child.userData.collision=false;child.name='bank-boost-pad';meshes.push(child);
      }
    }
  }
  return meshes;
}

export function bankBoostSpeed(along:number,offset:number,clearance:number) {
  const site=terrainBankAt(offset,along);
  if(!site || site.kind!=='boost' || Math.abs(along-(site.crestStart+site.crestEnd)/2)>BANK_BOOST.length/2 || Math.abs(offset-site.x)>BANK_BOOST.width/2)return 0;
  const floor=landscapeHeight(offset,along)-courseHeight(along)-.5;
  return clearance-floor>=-.05 && clearance-floor<.8?BANK_BOOST.speed:0;
}
