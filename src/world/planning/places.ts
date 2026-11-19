import {CHUNK_LENGTH,seededRandom} from './generation.ts';
import {sideBuildingForChunk} from './exploration.ts';
import {warehouseSiteAt} from './warehouseSite.ts';
import {ridingSiteForChunk} from './ridingSites.ts';
import {terrainBanksForChunk} from './terrainBanks.ts';
import type {SceneryExclusion} from '../environments/layout.ts';

export type PlaceKind='plaza'|'highrise'|'yard';
export type PlaceSite={id:string;kind:PlaceKind;side:-1|1;start:number;end:number;entryStart:number;exitEnd:number;seed:number};
export type PlacePatch={name:string;near:number;far:number;start:number;end:number;height:number;profile:'terrace'|'rise'|'flat'|'fall'|'floor'|'channel';sweep?:number;slab?:boolean};
export const placeSmooth=(value:number,start:number,end:number)=>{const t=Math.max(0,Math.min(1,(value-start)/(end-start)));return t*t*(3-2*t);};
const PREVIEWS:readonly PlaceSite[]=[
  {id:'preview-plaza',kind:'plaza',side:-1,start:420,end:650,entryStart:320,exitEnd:730,seed:71},
  {id:'preview-highrise',kind:'highrise',side:1,start:1390,end:1820,entryStart:1300,exitEnd:1900,seed:193},
  {id:'preview-yard',kind:'yard',side:-1,start:2020,end:2450,entryStart:1930,exitEnd:2530,seed:347},
];
const SECTOR=2100,FIRST=2900,KINDS:readonly PlaceKind[]=['plaza','highrise','yard'];
const sites=new Map<number,PlaceSite|null>();
export function placeHasSide(site:PlaceSite,side:number) {return site.kind==='highrise' || site.side===side;}
export function placePatchShift(patch:PlacePatch,along:number) {return (patch.sweep??0)*placeSmooth(along,patch.start,patch.end);}
export function placePatches(site:PlaceSite):PlacePatch[] {
  const s=site.start;
  if(site.kind==='plaza')return [{name:'terraced-plaza',near:54,far:112,start:s,end:site.end,height:1,profile:'terrace'}];
  const yard=site.kind==='yard',height=yard?4.2:6.8,firstEnd=180,join=90,secondEnd=250;
  return [
    {name:'courtyard',near:16,far:116,start:s,end:site.end-30,height:.018,profile:'floor'},
    {name:'roof-entry',near:26,far:56,start:s,end:s+70,height,profile:'rise'},
    {name:'first-roof',near:26,far:56,start:s+70,end:s+firstEnd,height,profile:'flat',slab:!yard},
    {name:'roof-bridge',near:56,far:70,start:s+join,end:s+join+140,height,profile:'flat',slab:true},
    {name:'second-roof',near:70,far:100,start:s+join,end:s+secondEnd,height,profile:'flat',slab:!yard},
    {name:'roof-exit',near:70,far:100,start:s+secondEnd,end:site.end,height,profile:'fall',sweep:-54},
    ...(yard?[{name:'banked-channel',near:103,far:116,start:s+30,end:site.end-70,height:1.8,profile:'channel' as const}]:[]),
  ];
}
export function placePatchLift(patch:PlacePatch,distance:number,along:number) {
  if(patch.profile==='floor')return patch.height;
  if(patch.profile==='terrace') {
    const rise=placeSmooth(along,patch.start,patch.start+40)*(1-placeSmooth(along,patch.end-40,patch.end));
    const edge=placeSmooth(distance,patch.near,patch.near+8)*(1-placeSmooth(distance,patch.far-8,patch.far));
    return rise*edge*(1.2+1.4*placeSmooth(distance,68,76)+1.8*placeSmooth(distance,88,96));
  }
  if(patch.profile==='channel') {
    const edge=Math.max(0,(Math.abs(distance-(patch.near+patch.far)/2)-3)/(6.5-3));
    return patch.height*edge*edge*placeSmooth(along,patch.start,patch.start+20)*(1-placeSmooth(along,patch.end-20,patch.end));
  }
  const rise=patch.profile==='rise'?placeSmooth(along,patch.start,patch.end):patch.profile==='fall'?1-placeSmooth(along,patch.start,patch.end):1;
  return patch.height*rise;
}
/** Connected line over the roofs; the main road remains available throughout. */
export function placeRouteX(site:PlaceSite,along:number) {
  let distance:number;
  if(site.kind==='plaza')distance=64+5*Math.sin(Math.max(0,Math.min(1,(along-site.start)/(site.end-site.start)))*Math.PI*2);
  else {
    const join=site.start+60,joined=site.start+220;
    distance=42+42*placeSmooth(along,join,joined);
    const exit=site.start+250;
    if(along>=exit)distance=84-54*placeSmooth(along,exit,site.end);
  }
  if(along<site.start)distance=12+(distance-12)*placeSmooth(along,site.entryStart,site.start);
  if(along>site.end)distance+=(12-distance)*placeSmooth(along,site.end,site.exitEnd);
  return site.side*distance;
}
export function placeGrading(site:PlaceSite,x:number,along:number) {
  if(!placeHasSide(site,Math.sign(x)))return 0;
  const d=Math.abs(x),near=site.kind==='plaza'?42:14;
  return placeSmooth(d,near,near+12)*(1-placeSmooth(d,145,180))*placeSmooth(along,site.entryStart,site.start)*(1-placeSmooth(along,site.end,site.exitEnd));
}
function blocked(site:PlaceSite) {
  for(let index=Math.floor(site.entryStart/CHUNK_LENGTH);index<=Math.floor(site.exitEnd/CHUNK_LENGTH);index++) {
    const building=sideBuildingForChunk(index),warehouse=warehouseSiteAt(index),riding=ridingSiteForChunk(index);
    if(building && placeHasSide(site,building.side) && building.approachStart<site.exitEnd && building.exitEnd>site.entryStart)return true;
    if(warehouse && placeHasSide(site,1) && warehouse.start-30<site.exitEnd && warehouse.end+warehouse.clearance>site.entryStart)return true;
    if(riding && placeHasSide(site,riding.side) && riding.start-60<site.exitEnd && riding.end+44>site.entryStart)return true;
    for(const bank of terrainBanksForChunk(index))if(placeHasSide(site,bank.side) && bank.branchStart<site.exitEnd && bank.clearEnd>site.entryStart)return true;
  }
  return false;
}
function sectorSite(sector:number):PlaceSite|null {
  if(sites.has(sector))return sites.get(sector)!;
  const rng=seededRandom(Math.imul(sector+1,0x51ed270b)),kind=KINDS[(sector+Math.floor(sector/3))%KINDS.length]!,side=(rng()<.5?-1:1) as -1|1;
  const base=FIRST+sector*SECTOR+Math.floor(rng()*220),length=kind==='plaza'?230:430;
  let chosen:PlaceSite|null=null;
  for(const offset of [0,280,560,840]) {
    const start=base+offset,candidate:PlaceSite={id:`${kind}-${sector}`,kind,side,start,end:start+length,entryStart:start-90,exitEnd:start+length+80,seed:Math.floor(rng()*0x7fffffff)};
    if(!blocked(candidate)){chosen=candidate;break;}
  }
  sites.set(sector,chosen);if(sites.size>32)sites.delete(sites.keys().next().value!);return chosen;
}
export function placeAt(along:number):PlaceSite|null {
  for(const site of PREVIEWS)if(along>=site.entryStart && along<=site.exitEnd)return site;
  const sector=Math.floor((along-FIRST+90)/SECTOR);if(sector<0)return null;
  for(const candidate of [sector,sector-1])if(candidate>=0) {
    const site=sectorSite(candidate);if(site && along>=site.entryStart && along<=site.exitEnd)return site;
  }
  return null;
}
export function placesForChunk(index:number):PlaceSite[] {
  const first=placeAt(index*CHUNK_LENGTH+.001),last=placeAt((index+1)*CHUNK_LENGTH-.001);
  return first&&last&&first.id!==last.id?[first,last]:first?[first]:last?[last]:[];
}
/** Suppress filler before authoring it; reserve entrances and room to see the area's silhouette. */
export function placeExclusions(site:PlaceSite,index:number):SceneryExclusion[] {
  const from=index*CHUNK_LENGTH,result:SceneryExclusion[]=[];
  for(const side of [-1,1])if(placeHasSide(site,side))result.push({minX:side<0?-144:12,maxX:side<0?-12:144,start:site.start-from,end:site.end-from});
  for(let along=Math.max(from,site.entryStart);along<Math.min(from+CHUNK_LENGTH,site.exitEnd);along+=10) {
    const a=placeRouteX(site,along),b=placeRouteX(site,along+10),width=along>=site.end?16:9;
    result.push({minX:Math.min(a,b)-width,maxX:Math.max(a,b)+width,start:along-from-3,end:along-from+13});
  }
  return result;
}
