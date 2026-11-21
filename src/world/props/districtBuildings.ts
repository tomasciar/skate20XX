import * as THREE from 'three';
import {group,box,part,post,gableRoof,windowOn,doorOn,unitDome,unitCylinder,wood,white,dark,glass,metal,paints,roofs,pick} from './parts.ts';
import {markAsset,sceneryMaterial} from './variety.ts';
import {addDistrictBuildingDetails} from './districtBuildingDetails.ts';

export const DISTRICT_BUILDINGS=['boathouse','terminal','adobe','service-station','courtyard','conservatory','lodge','lift-station'] as const;
export type DistrictBuilding=(typeof DISTRICT_BUILDINGS)[number];
const sandstone=sceneryMaterial(0xc78956,0,.97),desertRoof=sceneryMaterial(0xb06f49,0,.96);
const copper=sceneryMaterial(0x6a9588,.3,.65,'roof');
// Sphere meridians contain near-zero coordinates that can leave microscopic ray gaps after scaling.
const greenhouseDome=unitDome.clone();greenhouseDome.userData={shared:true};
const domePositions=greenhouseDome.getAttribute('position');
for(let i=0;i<domePositions.array.length;i++)if(Math.abs(domePositions.array[i]!)<1e-7)domePositions.array[i]=0;

/** Eight independent silhouettes using shared primitives and the ordinary seasonal/tint pipeline. */
export function makeDistrictBuilding(rng:()=>number,kind:DistrictBuilding) {
  const root=markAsset(group('pad'),'district-building');root.userData.buildingKind=kind;
  const wall=pick(paints,rng),roof=pick(roofs,rng),width=10+rng()*3,depth=9+rng()*3;
  let details={width,depth,height:5};
  const pane=(face:number,x:number,y:number,out:number,w:number,h:number)=>{
    const window=windowOn(root,face,x,y,out,w,h);window.userData.collision=false;return window;
  };
  const fascia=(w:number,d:number,y:number,mat=white)=>box(root,[w,.22,d],[0,y,0],mat);
  if(kind==='boathouse') {
    const h=4.4+rng()*1.2;
    details.height=h;
    box(root,[width,h,depth],[0,h/2,0],wall);gableRoof(root,width,depth,2.7,h,roof,white);
    for(const x of [-width*.27,width*.27]) {
      box(root,[width*.35,3,.08],[x,1.5,depth/2+.06],dark);
      for(let y=.5;y<3;y+=.55)box(root,[width*.34,.045,.1],[x,y,depth/2+.12],metal).userData.collision=false;
    }
    for(let x=-width/2+.6;x<width/2;x+=2.8)box(root,[.14,h,.16],[x,h/2,depth/2+.13],white);
    pane(1,0,2.7,width/2,depth*.6,1.15);pane(3,0,2.7,width/2,depth*.6,1.15);
    fascia(width+.3,depth+.3,h-.12);
  } else if(kind==='terminal') {
    const w=17,h=7.2,d=12;
    details={width:w,depth:d,height:h};
    box(root,[w,h,d],[0,h/2,0],wall);fascia(w+.7,d+.7,h+.1,copper);
    for(const x of [-5.6,0,5.6])pane(0,x,3.2,d/2,4.7,4.3);
    for(const face of [1,3])pane(face,0,3.4,w/2,8.5,4.8);
    box(root,[w+1,.25,3.2],[0,4.4,d/2+1.3],copper);
    box(root,[5.4,7.6,5.4],[-5.2,11,0],white);
    for(const face of [0,1,2,3])pane(face,0,11.7,2.8,4,2.4).position.x-=5.2;
    box(root,[6.3,.3,6.3],[-5.2,15,0],copper);
    doorOn(root,0,0,0,d/2,2.5,2.6,dark);
  } else if(kind==='adobe') {
    const w=width,h=4.8,d=depth;
    details.height=h;
    box(root,[w,h,d],[0,h/2,0],sandstone);fascia(w+.24,d+.24,h+.1,desertRoof);
    box(root,[w*.52,3.2,d*.6],[-w*.2,h+1.6,-d*.12],sandstone);
    box(root,[w*.54,.24,d*.62],[-w*.2,h+3.32,-d*.12],desertRoof);
    for(const x of [-w*.3,w*.3])pane(0,x,2.7,d/2,1.35,1.8);
    pane(1,0,2.7,w/2,1.8,1.8);pane(3,0,2.7,w/2,1.8,1.8);
    doorOn(root,0,0,0,d/2,1.25,2.5,wood);
    box(root,[3.2,.18,2.5],[0,2.8,d/2+1],wood);
    for(const x of [-1.45,1.45])post(root,.15,2.7,[x,1.35,d/2+2],wood);
  } else if(kind==='service-station') {
    details={width:14,depth:7,height:4.2};
    box(root,[14,4.2,7],[0,2.1,-3.8],wall);
    for(const x of [-4.7,0,4.7])pane(0,x,2.2,-.3,3.6,2.6);
    box(root,[17,.5,11],[0,4.7,3.4],white);box(root,[17.2,.4,1],[0,4.6,8.5],roof);
    for(const x of [-7.2,7.2])for(const z of [0,7.7])post(root,.22,4.5,[x,2.25,z],metal);
    for(const x of [-3.8,3.8]) {
      box(root,[.85,1.45,.65],[x,.73,3.8],white);box(root,[.6,.4,.08],[x,1.13,4.16],dark).userData.collision=false;
    }
    fascia(14.3,7.3,4.4);
  } else if(kind==='courtyard') {
    details={width:13.8,depth:12,height:5};
    for(const side of [-1,1]) {
      box(root,[3.4,5,12],[side*5.2,2.5,0],wall);
      const wing=new THREE.Group();wing.position.x=side*5.2;root.add(wing);gableRoof(wing,3.8,12,1.2,5,roof,wall,true,.25);
      pane(0,side*5.2,2.8,6,2.4,2.1);
    }
    box(root,[7.1,5,3.5],[0,2.5,-4.3],wall);
    for(const x of [-2.4,0,2.4])pane(0,x,2.6,-2.5,1.5,2);
    box(root,[7,.22,3],[0,3.5,4.5],wood);
    for(const x of [-3.2,0,3.2])post(root,.16,3.4,[x,1.7,5.5],wood);
  } else if(kind==='conservatory') {
    const w=13,d=12;
    details={width:w,depth:d,height:4.4};
    box(root,[w,1.2,d],[0,.6,0],white);box(root,[w-.2,3.2,d-.2],[0,2.8,0],glass);
    part(root,greenhouseDome,[w,6.5,d],[0,4.4,0],glass);
    for(const face of [-1,1])for(const z of [-5.8,-2.9,0,2.9,5.8])box(root,[.13,3.4,.13],[face*6.48,2.85,z],copper);
    for(const x of [-6.45,-3.2,0,3.2,6.45])box(root,[.13,3.4,.13],[x,2.85,6],copper);
    fascia(w+.2,d+.2,4.45,copper);doorOn(root,0,0,0,d/2,1.6,3.1,dark);
  } else if(kind==='lodge') {
    const w=14,d=12,h=7.4;
    details={width:w,depth:d,height:h};
    box(root,[w,2.4,d],[0,1.2,0],white);box(root,[w,h-2.4,d],[0,(h+2.4)/2,0],wood);
    gableRoof(root,w,d,3.4,h,roof,white);
    for(const x of [-4.5,0,4.5])for(const y of [1.7,5.2])pane(0,x,y,d/2,2.7,1.7);
    for(const face of [1,3])for(const z of [-3,3])pane(face,z,5.1,w/2,2,1.7);
    box(root,[w+.5,.24,2.5],[0,3.65,d/2+.9],wood);
    box(root,[w+.5,.12,.14],[0,4.55,d/2+2],wood);
    for(let x=-7;x<=7;x+=1.75)box(root,[.1,.85,.1],[x,4.1,d/2+2],wood);
    box(root,[1.4,5,1.6],[-4,9,-2],white);doorOn(root,0,0,0,d/2,1.6,2.5,dark);
  } else {
    details={width:13,depth:10,height:3.8};
    box(root,[13,3.8,10],[0,1.9,-1],wood);gableRoof(root,14,11,2.8,3.8,roof,white);
    pane(0,0,2.3,4.05,10,1.9);doorOn(root,0,0,0,4.1,2.2,2.5,dark);
    for(const side of [-1,1]) {
      box(root,[.8,13,.8],[side*5,6.5,-1],metal);
      box(root,[3.6,.5,2.4],[side*5,13,-1],metal);
      const wheel=part(root,unitCylinder,[2.2,.35,2.2],[side*5,13.4,-1],dark);wheel.rotation.z=Math.PI/2;
    }
    box(root,[11,.24,.24],[0,13.7,-1],metal);
  }
  addDistrictBuildingDetails(root,kind,details);
  return root;
}

/** Large stepped rock silhouettes, rather than simply larger copies of the existing boulder. */
export function makeMesa(rng:()=>number) {
  const root=markAsset(group(),'mesa'),height=9+rng()*17,width=7+rng()*10;
  for(let tier=0;tier<3;tier++) {
    const y=height*tier/3,scale=1-tier*.16;
    const rock=box(root,[width*scale,height/3,width*(.65+rng()*.2)*scale],[tier*.4,y+height/6,0],sandstone);
    rock.rotation.y=(rng()-.5)*.22;rock.userData.sceneryTint=tier%2?0xbb7b4f:0xd09b66;
    box(root,[width*scale*1.02,.25,width*.72*scale],[tier*.4,y+height/3+.03,0],desertRoof);
  }
  return root;
}

export function makeHarborCrane(rng:()=>number) {
  const root=markAsset(group('pad'),'harbor-crane'),h=13+rng()*7;
  for(const x of [-2.8,2.8])for(const z of [-2.8,2.8])box(root,[.45,h,.45],[x,h/2,z],metal);
  box(root,[7,.65,7],[0,h,0],metal);box(root,[3,2.7,3],[1,h+1.7,0],white);
  box(root,[22,.6,1.2],[3,h+3.2,0],metal);
  const stay=box(root,[.15,9,.15],[5,h+4.4,0],metal);stay.rotation.z=-1.18;
  box(root,[.10,h*.6,.10],[12,h*.7+3,0],dark);
  return root;
}
