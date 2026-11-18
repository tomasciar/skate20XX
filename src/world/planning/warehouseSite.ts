import {CHUNK_LENGTH} from './generation.ts';
import {hasRoofLaunch,ROOF_LAUNCH} from './roofPlan.ts';

/** Metres in the owning chunk's hill frame. The roof is over 100 m long and entirely roadside. */
export const WAREHOUSE={
  firstChunk:3,repeatChunks:32,
  start:34,end:182,near:11.6,far:29.6,height:4,
  rampStart:9,rampEnd:28,rampX:5.3,rampExitX:8.3,rampWidth:4.4,rampHeight:3.3,
  landingClearance:48,
} as const;
export type WarehouseSite={owner:number;start:number;end:number;clearance:number};

/** All intersected chunks reserve the same lot; only the owner creates its continuous geometry. */
export function warehouseSiteAt(index:number):WarehouseSite|null {
  if(index<WAREHOUSE.firstChunk)return null;
  const owner=WAREHOUSE.firstChunk+Math.floor((index-WAREHOUSE.firstChunk)/WAREHOUSE.repeatChunks)*WAREHOUSE.repeatChunks;
  const start=owner*CHUNK_LENGTH+WAREHOUSE.start,end=owner*CHUNK_LENGTH+WAREHOUSE.end;
  const clearance=hasRoofLaunch(owner,WAREHOUSE.firstChunk,WAREHOUSE.repeatChunks)?ROOF_LAUNCH.landing:WAREHOUSE.landingClearance;
  if(index*CHUNK_LENGTH>end+clearance || (index+1)*CHUNK_LENGTH<owner*CHUNK_LENGTH+WAREHOUSE.rampStart)return null;
  return {owner,start,end,clearance};
}

