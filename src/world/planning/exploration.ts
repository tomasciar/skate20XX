import {CHUNK_LENGTH} from './generation.ts';
import type {SceneryExclusion} from '../environments/layout.ts';
import {WAREHOUSE} from './warehouseSite.ts';
import {hasRoofLaunch,ROOF_LAUNCH} from './roofPlan.ts';
import {terrainBankExclusions} from './terrainBanks.ts';

const smooth=(value:number,start:number,end:number)=>{
  const t=Math.max(0,Math.min(1,(value-start)/(end-start)));return t*t*(3-2*t);
};
export const SIDE_BUILDING={firstOwner:2,period:28,start:-8,near:30,far:50,approach:75,exit:80} as const;
export type SideBuildingSite={owner:number;side:-1|1;start:number;end:number;height:number;approachStart:number;exitEnd:number};
const HEIGHTS=[12,24,18,32,20,36] as const;
const approachForHeight=(height:number)=>height<=12?SIDE_BUILDING.approach:Math.ceil(height*1.5/.22)+6;
const MAX_LEAD=Math.max(...HEIGHTS.map(height=>approachForHeight(height)+(height>12?80:0)));
const sites=new Map<number,SideBuildingSite>();
const earlyTower:SideBuildingSite={owner:13,side:1,start:902,end:1112,height:28,approachStart:712,exitEnd:1292};
export function sideBuildingEntryStart(site:SideBuildingSite) {return site.approachStart-(site.height>12?80:0);}
export function sideBuildingEntryX(site:SideBuildingSite,along:number) {
  const end=site.height>12?site.approachStart+8:site.start-6;
  return site.side*(12+26*smooth(along,sideBuildingEntryStart(site),end));
}
function siteAtCycle(cycle:number):SideBuildingSite {
  const known=sites.get(cycle);if(known)return known;
  const owner=SIDE_BUILDING.firstOwner+cycle*SIDE_BUILDING.period,start=owner*CHUNK_LENGTH+SIDE_BUILDING.start;
  const end=start+[180,195,210][cycle%3]!,height=HEIGHTS[cycle%HEIGHTS.length]!;
  const approach=approachForHeight(height);
  const exit=height<=12?SIDE_BUILDING.exit:height*5+40;
  const site:SideBuildingSite={owner,side:cycle%2?1:-1,start,end,height,approachStart:start-approach,exitEnd:end+exit};
  sites.set(cycle,site);if(sites.size>32)sites.delete(sites.keys().next().value!);return site;
}
export function sideBuildingAt(along:number):SideBuildingSite|null {
  if(along>=sideBuildingEntryStart(earlyTower) && along<=earlyTower.exitEnd)return earlyTower;
  // Taller sites need a longer ground approach. Look ahead far enough to discover that
  // approach before the fixed district period begins, rather than introducing a height step.
  const first=SIDE_BUILDING.firstOwner*CHUNK_LENGTH+SIDE_BUILDING.start-MAX_LEAD;
  const cycle=Math.floor((along-first)/(SIDE_BUILDING.period*CHUNK_LENGTH));
  if(cycle<0)return null;const site=siteAtCycle(cycle);
  return along>=sideBuildingEntryStart(site) && along<=site.exitEnd?site:null;
}
export function sideBuildingForChunk(index:number):SideBuildingSite|null {
  const current=sideBuildingAt(index*CHUNK_LENGTH) ?? sideBuildingAt((index+1)*CHUNK_LENGTH);
  if(current)return current;
  const recent=sideBuildingAt(index*CHUNK_LENGTH-ROOF_LAUNCH.landing+SIDE_BUILDING.exit);
  return recent && hasRoofLaunch(recent.owner,SIDE_BUILDING.firstOwner,SIDE_BUILDING.period) && index*CHUNK_LENGTH<=recent.end+ROOF_LAUNCH.landing?recent:null;
}

/** A loose, meandering ground line. There are no hard track edges or automatic steering. */
export function sideRouteCenter(along:number,side:number) {
  const phase=(along-(side<0?55:225))/420;
  let distance=10+36*Math.sin(Math.PI*phase)**2;
  const site=sideBuildingAt(along);
  if(site && site.side===side) {
    const begin=site.height>12?sideBuildingEntryStart(site):site.start-50;
    const entered=site.height>12?site.approachStart+10:site.start-10;
    const bypass=smooth(along,begin,entered)*(1-smooth(along,site.end+10,site.exitEnd));
    distance+=(Math.min(distance,site.height>12?14:21)-distance)*bypass;
  }
  if(side>0) {
    const first=WAREHOUSE.firstChunk*CHUNK_LENGTH+WAREHOUSE.start;
    const cycle=Math.floor((along-first+110)/(WAREHOUSE.repeatChunks*CHUNK_LENGTH));
    if(cycle>=0) {
      const start=first+cycle*WAREHOUSE.repeatChunks*CHUNK_LENGTH,end=start+WAREHOUSE.end-WAREHOUSE.start;
      const detour=smooth(along,start-110,start-30)*(1-smooth(along,end+20,end+110));
      distance+=(Math.max(distance,WAREHOUSE.far+8)-distance)*detour;
    }
  }
  // The authored quarter has a readable covered street, rather than a clearing that snakes through shops.
  if(side<0)distance+=(17-distance)*smooth(along,100,195)*(1-smooth(along,550,625));
  return side*distance;
}

/** Broad approach and landing banks lead naturally to the roof from the surrounding ground. */
export function sideBuildingBank(x:number,along:number) {
  const site=sideBuildingAt(along);if(!site || Math.sign(x)!==site.side)return 0;
  const distance=Math.abs(x),across=smooth(distance,12,30)*(1-smooth(distance,46,80));
  const entry=smooth(along,site.approachStart,site.start-6)*(1-smooth(along,site.start+8,site.start+60));
  const exit=smooth(along,site.end-20,site.end+15)*(1-smooth(along,site.end+15,site.exitEnd));
  return across*site.height*Math.max(entry,.65*exit);
}

/** Reserve connected riding space instead of letting decorative collision seal off the valley. */
export function explorationExclusions(index:number):SceneryExclusion[] {
  const start=index*CHUNK_LENGTH,areas:SceneryExclusion[]=[];
  for(const side of [-1,1])for(let s=0;s<CHUNK_LENGTH;s+=10) {
    const a=sideRouteCenter(start+s,side),b=sideRouteCenter(start+s+10,side);
    // Leave recovery room around the line: a fast carve trails the center of a bend.
    areas.push({minX:Math.min(a,b)-7.5,maxX:Math.max(a,b)+7.5,start:s-1,end:s+11});
  }
  const site=sideBuildingForChunk(index);
  if(site) {
    const band=(near:number,far:number,from:number,to:number)=>areas.push({
      minX:site.side<0?-far:near,maxX:site.side<0?-near:far,start:from-start,end:to-start,
    });
    band(26,54,site.start-4,site.exitEnd);
    if(hasRoofLaunch(site.owner,SIDE_BUILDING.firstOwner,SIDE_BUILDING.period))band(27,43,site.end,site.end+ROOF_LAUNCH.landing);
    for(let s=Math.max(start,sideBuildingEntryStart(site));s<Math.min(start+CHUNK_LENGTH,site.start);s+=10) {
      const a=Math.abs(sideBuildingEntryX(site,s)),b=Math.abs(sideBuildingEntryX(site,s+10));
      band(Math.min(a,b)-6,Math.max(a,b)+6,s-3,s+13);
    }
  }
  areas.push(...terrainBankExclusions(index,sideRouteCenter));
  return areas;
}
