import {CHUNK_LENGTH} from './generation.ts';
import type {SceneryExclusion} from '../environments/layout.ts';

export type TerrainBank={owner:number;kind:'boost'|'launch'|'plain';side:-1|1;x:number;width:number;height:number;start:number;crestStart:number;crestEnd:number;end:number;branchStart:number;clearEnd:number};
const PERIOD=56*CHUNK_LENGTH;
const DEFINITIONS=[
  {owner:4,kind:'boost',side:1,x:68,width:32,height:7,start:210,crestStart:292,crestEnd:320,end:380,branchStart:140,clearEnd:480},
  {owner:8,kind:'launch',side:-1,x:-26,width:22,height:5.5,start:490,crestStart:568,crestEnd:590,end:642,branchStart:445,clearEnd:750},
  {owner:10,kind:'plain',side:1,x:68,width:32,height:6,start:640,crestStart:716,crestEnd:736,end:798,branchStart:570,clearEnd:858},
] as const;
const cache=new Map<string,TerrainBank>();
export const bankSmooth=(v:number,a:number,b:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
function siteAt(definition:typeof DEFINITIONS[number],cycle:number):TerrainBank {
  const key=`${definition.kind}:${cycle}`,known=cache.get(key);if(known)return known;
  const shift=cycle*PERIOD;
  const site:TerrainBank={...definition,owner:definition.owner+cycle*56,start:definition.start+shift,crestStart:definition.crestStart+shift,crestEnd:definition.crestEnd+shift,end:definition.end+shift,branchStart:definition.branchStart+shift,clearEnd:definition.clearEnd+shift};
  cache.set(key,site);if(cache.size>48)cache.delete(cache.keys().next().value!);return site;
}
export function terrainBanksForChunk(index:number):TerrainBank[] {
  const from=index*CHUNK_LENGTH,to=from+CHUNK_LENGTH,result:TerrainBank[]=[];
  for(const definition of DEFINITIONS) {
    const cycle=Math.floor((to-definition.branchStart)/PERIOD);if(cycle<0)continue;
    const site=siteAt(definition,cycle);if(from<=site.clearEnd && to>=site.branchStart)result.push(site);
  }
  return result;
}
export function terrainBankAt(x:number,along:number):TerrainBank|null {
  for(const definition of DEFINITIONS) {
    const cycle=Math.floor((along-definition.branchStart)/PERIOD);if(cycle<0)continue;
    const site=siteAt(definition,cycle);
    if(along>=site.start && along<=site.end && Math.abs(x-site.x)<site.width/2)return site;
  }
  return null;
}
export function terrainBankHeight(site:TerrainBank,x:number,along:number) {
  const core=site.kind==='launch'?4:6;
  const across=1-bankSmooth(Math.abs(x-site.x),core,site.width/2);
  return site.height*across*bankSmooth(along,site.start,site.crestStart)*(1-bankSmooth(along,site.crestEnd,site.end));
}
export function terrainBankLine(site:TerrainBank,along:number,entryX:number) {
  return entryX+(site.x-entryX)*bankSmooth(along,site.branchStart,site.crestStart);
}
export function terrainBankExclusions(index:number,route:(along:number,side:number)=>number):SceneryExclusion[] {
  const start=index*CHUNK_LENGTH,areas:SceneryExclusion[]=[];
  for(const site of terrainBanksForChunk(index)) {
    const entryX=route(site.branchStart,site.side);
    for(let along=Math.max(start,site.branchStart);along<Math.min(start+CHUNK_LENGTH,site.crestEnd);along+=10) {
      const a=terrainBankLine(site,along,entryX),b=terrainBankLine(site,along+10,entryX);
      areas.push({minX:Math.min(a,b)-6,maxX:Math.max(a,b)+6,start:along-start-3,end:along-start+13});
    }
    areas.push({minX:site.x-9,maxX:site.x+9,start:site.start-start,end:site.clearEnd-start});
  }
  return areas;
}
export const BANK_BOOST={width:5.6,length:16,speed:42.4688} as const;
