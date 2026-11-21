import type {BranchRoad} from './branchRoads.ts';
import {branchRoadX} from './branchRoads.ts';

export type PlayLane={kind:'dock'|'rollers'|'transfer';start:number;end:number;offset:number;width:number;baseHeight:number;railStart?:number;railEnd?:number};
/** Optional lines live on the inner shoulder, opposite the existing roof access or outer carving bank. */
export function branchPlayLanes(road:BranchRoad):PlayLane[] {
  if(road.kind==='cutting')return [];
  const gallery=road.kind==='boulevard'||road.kind==='parkway'&&road.seed%2===1;
  const start=road.start+road.lead+25,end=road.end-road.lead-25;
  if(end-start<85)return [];
  const kind=gallery?'dock':road.kind==='esplanade'||road.seed%4===0?'transfer':'rollers';
  const lane:PlayLane={kind,start,end,offset:-road.side*(road.width/2+5),width:8,baseHeight:0,
    ...(kind==='dock'?{railStart:start+31,railEnd:start+49}:{})};
  const result=[lane];
  if(gallery) {
    lane.end=Math.min(end,start+80);
    if(end-lane.end>65)result.push({...lane,kind:'rollers',start:lane.end+15,end,railStart:undefined,railEnd:undefined});
    const roofStart=road.start+road.lead+65,roofEnd=road.end-road.lead-27;
    if(road.seed%3===1 && roofEnd-roofStart>100)result.push({kind:'transfer',start:roofStart+12,end:roofStart+89,offset:0,width:6,baseHeight:7.6});
  }
  return result;
}
export const playSmooth=(s:number,a:number,b:number)=>{const t=Math.max(0,Math.min(1,(s-a)/(b-a)));return t*t*(3-2*t);};
export function playLaneHeight(lane:PlayLane,s:number) {
  if(s<lane.start||s>lane.end)return 0;
  if(lane.kind==='dock')return 1.15*playSmooth(s,lane.start,lane.start+25)*(1-playSmooth(s,lane.end-25,lane.end));
  if(lane.kind==='rollers') {
    const t=(s-lane.start)/(lane.end-lane.start);
    return 1.35*Math.sin(t*Math.PI*3)**2*playSmooth(s,lane.start,lane.start+10)*(1-playSmooth(s,lane.end-10,lane.end));
  }
  const launch=lane.start+25,landing=launch+7;
  if(s<=launch)return 2.1*((s-lane.start)/25)**2;
  if(s<landing)return 0;
  return 1.5*(1-playSmooth(s,landing,Math.min(lane.end,landing+45)));
}
export function playLaneX(road:BranchRoad,lane:PlayLane,s:number){return branchRoadX(road,s)+lane.offset;}
