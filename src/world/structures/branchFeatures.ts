import * as THREE from 'three';
import type {BranchRoad} from '../planning/branchRoads.ts';
import {branchRoadX} from '../planning/branchRoads.ts';
import {CHUNK_LENGTH} from '../planning/generation.ts';
import {COURSE_STEP,courseHeight} from '../terrain/course.ts';
import {landscapeHeight} from '../terrain/landscape.ts';
import {LANDMARK_MATERIALS as M,landmarkBox} from './parts.ts';

const smooth=(s:number,a:number,b:number)=>{const t=Math.max(0,Math.min(1,(s-a)/(b-a)));return t*t*(3-2*t);};
const floor=(x:number,s:number)=>landscapeHeight(x,s)-courseHeight(s);
type SurfaceOptions={slab?:boolean;level?:boolean;step?:number;baseHeight?:number};
/** Solids are sliced by normal chunk ownership, including roof undersides and exact open passages. */
export function makeBranchSurface(index:number,road:BranchRoad,start:number,end:number,near:number,far:number,height:(s:number,u:number)=>number,material:THREE.Material,{slab=false,level=false,step=COURSE_STEP,baseHeight}:SurfaceOptions={}) {
  const base=index*CHUNK_LENGTH,a=Math.max(base,start),b=Math.min(base+CHUNK_LENGTH,end);if(b<=a)return null;
  const rows=[a];for(let s=Math.ceil((a+.00001)/step)*step;s<b;s+=step)rows.push(s);rows.push(b);
  const positions:number[]=[],indices:number[]=[],columns=3,count=rows.length*columns;
  for(const bottom of [false,true])for(const s of rows)for(let col=0;col<columns;col++) {
    const u=col/(columns-1),x=branchRoadX(road,s)+near+(far-near)*u,h=height(s,u);
    const ground=floor(x,s),reference=level?floor(branchRoadX(road,s),s):ground;
    const underside=baseHeight!==undefined?reference+baseHeight-.02:slab?reference+h-.35:ground-.2;
    positions.push(x,bottom?underside:reference+h+.012,-(s-base));
  }
  for(let row=0;row<rows.length-1;row++)for(let col=0;col<columns-1;col++) {
    const a=row*columns+col,b=a+1,c=a+columns,d=c+1;
    indices.push(a,b,c,b,d,c,a+count,c+count,b+count,b+count,c+count,d+count);
  }
  for(let row=0;row<rows.length-1;row++)for(const col of [0,columns-1]) {
    const a=row*columns+col,b=a+columns;
    if(col===0)indices.push(a,b,a+count,b,b+count,a+count);
    else indices.push(a,a+count,b,b,a+count,b+count);
  }
  for(let col=0;col<columns-1;col++) {
    const a=col,b=a+1,c=(rows.length-1)*columns+col,d=c+1;
    indices.push(a,a+count,b,b,a+count,b+count,c,d,c+count,d,d+count,c+count);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const uv:number[]=[];for(let i=0;i<positions.length;i+=3)uv.push(positions[i]!/10,(base-positions[i+2]!)/14);
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  return new THREE.Mesh(geometry,material);
}

export function* makeBranchFeatures(index:number,road:BranchRoad,asphalt:THREE.Material) {
  const from=index*CHUNK_LENGTH,to=from+CHUNK_LENGTH,a=road.start+road.lead+15,b=road.end-road.lead-15;
  if(to<a-55 || from>b+55)return;
  const gallery=road.kind==='boulevard'||road.kind==='parkway'&&road.seed%2===1;
  if(gallery) {
    // Begin the access bank after the fork's first turn, leaving room to line up.
    const start=a+50,end=b-12,h=7.6,half=road.width/2+13;
    const roof=makeBranchSurface(index,road,start,end,-half,half,()=>h,asphalt,{slab:true,level:true});
    if(roof){roof.name='branch-gallery-roof';yield roof;}
    for(const edge of [-half,half]) {
      const fascia=makeBranchSurface(index,road,start,end,edge-.06,edge+.06,()=>h-.18,M.steel,{slab:true,level:true});
      if(fascia){fascia.name='branch-gallery-fascia';fascia.userData.collision=false;yield fascia;}
    }
    // A narrow outside bank reaches the roof; the wide road below remains entirely open.
    const near=road.side>0?road.width/2+1:-road.width/2-13,far=near+12;
    for(const [s,e,profile] of [[start-55,start,0],[end,end+55,2]]) {
      const access=makeBranchSurface(index,road,s!,e!,near,far,t=>h*(profile===0?smooth(t,s!,e!):1-smooth(t,s!,e!)),asphalt,{level:true});
      if(access){access.name='branch-roof-access';yield access;}
    }
    for(let s=start+5;s<end;s+=25)if(s>=from && s<to) {
      for(const side of [-1,1]) {
        const x=branchRoadX(road,s)+side*(road.width/2+11.8);
        const ground=floor(x,s),top=floor(branchRoadX(road,s),s)+h-.36,height=Math.max(.2,top-ground);
        const pillar=landmarkBox(M.brick,[.65,height,1.1],[x,ground+height/2,-(s-from)]);pillar.name='branch-gallery-column';yield pillar;
      }
      // Keep beams below the slab even where its terrain-matched cross section slopes slightly.
      const x=branchRoadX(road,s),beam=landmarkBox(M.trim,[half*2,.3,1.1],[x,floor(x,s)+h-.75,-(s-from)]);
      beam.name='branch-gallery-beam';yield beam;
    }
  } else {
    for(const side of road.kind==='cutting'?[-1,1]:[road.side]) {
      const near=side>0?road.width/2:-road.width/2-7,far=near+7;
      const bank=makeBranchSurface(index,road,a-20,b+20,near,far,(s,u)=>{
        const outer=side>0?u:1-u;
        return (road.kind==='cutting'?4:3.1)*outer*outer*smooth(s,a-20,a+12)*(1-smooth(s,b-12,b+20));
      },asphalt);
      if(bank){bank.name='branch-carving-bank';yield bank;}
    }
    if(road.kind==='cutting')for(const side of [-1,1]) {
      const near=side>0?road.width/2+9:-road.width/2-13;
      const wall=makeBranchSurface(index,road,a,b,near,near+4,s=>8*smooth(s,a,a+18)*(1-smooth(s,b-18,b)),M.brick);
      if(wall){wall.name='branch-rock-cut';wall.userData.sceneryTint=0xc38d59;yield wall;}
    }
  }
}
