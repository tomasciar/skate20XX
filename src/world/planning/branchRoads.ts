import {CHUNK_LENGTH,districtAt,seededRandom} from './generation.ts';
import {sideBuildingForChunk} from './exploration.ts';
import {warehouseSiteAt,WAREHOUSE} from './warehouseSite.ts';
import {ridingSiteForChunk,ridingPathX} from './ridingSites.ts';
import {terrainBanksForChunk} from './terrainBanks.ts';
import {placesForChunk,placeHasSide} from './places.ts';
import type {SceneryExclusion} from '../environments/layout.ts';

export type BranchKind='parkway'|'esplanade'|'cutting'|'boulevard';
export type BranchRoad={id:string;start:number;end:number;side:-1|1;reach:number;width:number;lead:number;sweep:number;kind:BranchKind;seed:number};
const PERIOD=910,FIRST=55;
const cache=new Map<number,BranchRoad|null>();
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
/** Full-width alternative roads split gently and return to the original road. */
export function branchRoadX(road:BranchRoad,along:number) {
  const entry=smooth((along-road.start)/road.lead),exit=smooth((road.end-along)/road.lead);
  const t=Math.max(0,Math.min(1,(along-road.start)/(road.end-road.start)));
  return road.side*entry*exit*(road.reach+road.sweep*Math.sin(t*Math.PI*2));
}
export function branchRoadGrade(road:BranchRoad,x:number,along:number) {
  const d=Math.abs(x-branchRoadX(road,along)),half=road.width/2;
  return (1-smooth((d-half-8)/24))*smooth((Math.abs(x)-12)/12)
    *smooth((along-road.start)/18)*smooth((road.end-along)/18);
}
export function branchRoadHeight(road:BranchRoad,along:number) {
  const t=(along-road.start)/(road.end-road.start);
  return .46+(road.kind==='cutting'?1.2:road.kind==='parkway'?.55:.2)*Math.sin(Math.PI*t)**2;
}
/** Do not put a road through a building, existing riding structure, or composed area. */
function blocked(road:BranchRoad) {
  for(let along=road.start+10;along<road.end;along+=10) {
    const index=Math.floor(along/CHUNK_LENGTH),x=branchRoadX(road,along),r=road.width/2+4;
    const overlaps=(near:number,far:number,side:number)=>x+r>Math.min(side*near,side*far)&&x-r<Math.max(side*near,side*far);
    const building=sideBuildingForChunk(index),warehouse=warehouseSiteAt(index),riding=ridingSiteForChunk(index);
    if(building && along>=building.start-12 && along<=building.end+12 && overlaps(26,54,building.side))return true;
    if(warehouse && along>=warehouse.start-10 && along<=warehouse.end+10 && overlaps(WAREHOUSE.near-2,WAREHOUSE.far+2,1))return true;
    if(riding && along>=riding.start-8 && along<=riding.end+8 && Math.abs(x-ridingPathX(riding,along))<r+riding.width/2)return true;
    for(const bank of terrainBanksForChunk(index))if(along>=bank.start && along<=bank.end && Math.abs(x-bank.x)<r+bank.width/2)return true;
    for(const place of placesForChunk(index))if(along>=place.start-5 && along<=place.end+5 && placeHasSide(place,road.side) && overlaps(12,144,road.side))return true;
    // The original workshop lives close to the road and must keep its uphill approach.
    if((index===2 || index>2&&index%17===2) && x>7 && x-r<18 && along%70>8 && along%70<65)return true;
  }
  return false;
}
function roadForSector(sector:number):BranchRoad|null {
  if(cache.has(sector))return cache.get(sector)!;
  const rng=seededRandom(Math.imul(sector+1,0x4b135c27));
  const start=FIRST+sector*PERIOD+(sector?Math.floor(rng()*85):0),length=sector?580+Math.floor(rng()*120):650;
  const district=districtAt(Math.floor((start+length/2)/CHUNK_LENGTH)).district;
  const kind:BranchKind=district==='harbor'?'esplanade':district==='canyon'?'cutting':district==='city'||district==='mill'?'boulevard':'parkway';
  let chosen:BranchRoad|null=null;
  const preferred=sector===0?1:rng()<.5?-1:1;
  candidates:for(const side of [preferred,-preferred])for(const reach of [110,142,174]) {
    const road:BranchRoad={id:`branch-${sector}`,start,end:start+length,side:side as -1|1,reach,width:kind==='boulevard'?18:14,lead:220,sweep:sector===0?0:8+rng()*8,kind,seed:sector+37};
    if(!blocked(road)){chosen=road;break candidates;}
  }
  cache.set(sector,chosen);if(cache.size>64)cache.delete(cache.keys().next().value!);return chosen;
}
export function branchRoadAt(along:number):BranchRoad|null {
  const sector=Math.floor((along-FIRST)/PERIOD);if(sector<0)return null;
  const road=roadForSector(sector);
  return road && along>=road.start && along<=road.end?road:null;
}
export function branchRoadsForChunk(index:number):BranchRoad[] {
  const a=branchRoadAt(index*CHUNK_LENGTH),b=branchRoadAt((index+1)*CHUNK_LENGTH);
  return a?[a]:b?[b]:[];
}
export function branchRoadExclusions(road:BranchRoad,index:number):SceneryExclusion[] {
  const from=index*CHUNK_LENGTH,result:SceneryExclusion[]=[];
  for(let s=Math.max(from,road.start);s<Math.min(from+CHUNK_LENGTH,road.end);s+=5) {
    const a=branchRoadX(road,s),b=branchRoadX(road,Math.min(s+5,road.end)),r=road.width/2+18;
    result.push({minX:Math.min(a,b)-r,maxX:Math.max(a,b)+r,start:s-from-2,end:s-from+7});
  }
  return result;
}
