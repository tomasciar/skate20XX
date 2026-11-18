import {CHUNK_LENGTH} from './generation.ts';
import {sideRouteCenter,sideBuildingForChunk} from './exploration.ts';
import {warehouseSiteAt} from './warehouseSite.ts';
import type {SceneryExclusion} from './environments/layout.ts';

export type RidingSite={owner:number;kind:'pavilion'|'spillway'|'cliff';side:-1|1;x:number;start:number;end:number;width:number;height:number};
const DEFINITIONS=[
  {first:8,kind:'pavilion',side:1,width:16,height:3.2,offset:8,length:56,period:24,approach:6},
  {first:10,kind:'spillway',side:-1,width:18,height:2.6,offset:8,length:56,period:24,approach:6},
  {first:14,kind:'cliff',side:-1,width:12,height:6,offset:-10,length:140,period:56,approach:60},
] as const;

/** Sparse architecture along existing ground routes, with early examples and shared reservations. */
export function ridingSiteForChunk(index:number):RidingSite|null {
  const chunkStart=index*CHUNK_LENGTH,chunkEnd=chunkStart+CHUNK_LENGTH;
  for(const definition of DEFINITIONS) {
    const first=definition.first*CHUNK_LENGTH+definition.offset-definition.approach;
    if(chunkEnd<first)continue;
    const cycle=Math.floor((chunkEnd-first)/(definition.period*CHUNK_LENGTH)),owner=definition.first+cycle*definition.period;
    const start=owner*CHUNK_LENGTH+definition.offset,end=start+definition.length;
    if(chunkStart>end+44 || chunkEnd<start-definition.approach)continue;
    const side=(cycle%2?-definition.side:definition.side) as -1|1;
    let blocked=false;
    for(let i=Math.floor((start-definition.approach)/CHUNK_LENGTH);i<=Math.floor((end+44)/CHUNK_LENGTH);i++) {
      const building=sideBuildingForChunk(i),warehouse=warehouseSiteAt(i);
      if(building?.side===side && start-definition.approach<building.exitEnd && end+44>building.approachStart)blocked=true;
      if(side>0 && warehouse && start-definition.approach<warehouse.end+warehouse.clearance && end+44>warehouse.start-30)blocked=true;
    }
    if(blocked)continue;
    const distance=definition.kind==='cliff'?32:Math.max(18,Math.abs(sideRouteCenter((start+end)/2,side)));
    return {owner,kind:definition.kind,side,x:side*distance,start,end,width:definition.width,height:definition.height};
  }
  return null;
}

export function ridingPathX(site:RidingSite,along:number) {
  if(site.kind!=='cliff')return site.x;
  const t=Math.max(0,Math.min(1,(along-site.start)/(site.end-site.start)));
  return site.x+site.side*14*(1-Math.cos(t*Math.PI*2));
}

export function ridingSiteExclusions(site:RidingSite,index:number):SceneryExclusion[] {
  const chunkStart=index*CHUNK_LENGTH;
  if(site.kind!=='cliff')return [{minX:site.x-site.width/2-3,maxX:site.x+site.width/2+3,start:site.start-chunkStart-6,end:site.end-chunkStart+44}];
  const areas:SceneryExclusion[]=[];
  for(let along=Math.max(chunkStart,site.start-60);along<Math.min(chunkStart+CHUNK_LENGTH,site.end+44);along+=10) {
    const route=(s:number)=>{
      if(s>=site.start)return ridingPathX(site,s);
      const entry=sideRouteCenter(site.start-60,site.side),t=Math.max(0,Math.min(1,(s-site.start+60)/60));
      return entry+(site.x-entry)*t*t*(3-2*t);
    };
    const a=route(along),b=route(along+10);
    areas.push({minX:Math.min(a,b)-site.width/2-6,maxX:Math.max(a,b)+site.width/2+6,start:along-chunkStart-3,end:along-chunkStart+13});
  }
  return areas;
}
