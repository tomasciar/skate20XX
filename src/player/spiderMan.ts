import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {headContour,headSurface,headHalfWidth} from './modelGeometry.ts';
import {cosmeticMesh as mesh,projectedPatch as patch,projectedLine as stroke} from './characterPrimitives.ts';
import type {Point2} from './characterPrimitives.ts';

const RED=0xcf303b,INK=0x20242d;
/** Surface ribbons keep the webbing thin without hundreds of little tubes or extra draw calls. */
function strip(parent:THREE.Group,steps:number,a:(t:number)=>THREE.Vector3,b:(t:number)=>THREE.Vector3) {
  const positions:number[]=[],indices:number[]=[];
  for(let i=0;i<=steps;i++)positions.push(...a(i/steps).toArray(),...b(i/steps).toArray());
  for(let i=0;i<steps;i++) {
    const v=i*2,aa=new THREE.Vector3().fromArray(positions,v*3),bb=new THREE.Vector3().fromArray(positions,(v+1)*3),cc=new THREE.Vector3().fromArray(positions,(v+2)*3);
    const normal=bb.clone().sub(aa).cross(cc.clone().sub(aa));
    const outward=aa.clone().setY(0);outward.z-=.005;
    if(normal.dot(outward)>0)indices.push(v,v+1,v+2,v+1,v+3,v+2);else indices.push(v,v+2,v+1,v+1,v+2,v+3);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();mesh(parent,g,INK);
}

export function addSpiderHead(parent:THREE.Group) {
  for(let i=2;i<=6;i++) {
    const angle=i/8*Math.PI*2;
    strip(parent,24,t=>headContour(angle-.010,-.093+t*.205,'spiderman',.0024),t=>headContour(angle+.010,-.093+t*.205,'spiderman',.0024));
  }
  for(const y of [-.065,-.028,.012,.053,.087]) {
    const point=(t:number,offset:number)=>{const angle=Math.PI/2+t*Math.PI,bow=.006*Math.sin(angle*4)**2;return headContour(angle,y+bow+offset,'spiderman',.0024);};
    strip(parent,32,t=>point(t,-.0008),t=>point(t,.0008));
  }
  const surface=(x:number,y:number)=>headSurface(x,y,'spiderman');
  const webPoint=(angle:number,r:number):Point2=>{
    const y=.003+Math.cos(angle)*.105*r,half=headHalfWidth(y,'spiderman')*.97;
    return [THREE.MathUtils.clamp(Math.sin(angle)*.086*r,-half,half),y];
  };
  // Classic facial web radiates from between the lenses; the reverse retains wrapped arcs.
  for(let i=0;i<12;i++)stroke(parent,INK,[0,.32,.65,1].map(r=>webPoint(i/12*Math.PI*2,r)),surface,.00125,false,.0028);
  for(const radius of [.26,.49,.72,.94])stroke(parent,INK,Array.from({length:25},(_,i)=>{
    const angle=i/24*Math.PI*2;return webPoint(angle,radius*(1-.055*Math.sin(angle*6)**2));
  }),surface,.00125,false,.0028);
  for(const side of [-1,1]) {
    const lens:Point2[]=[[side*.010,.006],[side*.035,.019],[side*.079,.049],[side*.075,.013],[side*.062,-.015],[side*.043,-.036],[side*.025,-.032],[side*.013,-.012]];
    patch(parent,INK,lens,surface,false,.0045,2);
    patch(parent,0xf6f8ee,lens.map(([x,y])=>[side*.039+(x-side*.039)*.82,.003+(y-.003)*.79] as const),surface,false,.0062,2);
  }
  parent.scale.setScalar(1.10);
}

function spider(parent:THREE.Group,surface:(x:number,y:number)=>number,back:boolean) {
  const color=back?RED:INK,cx=0,cy=.294,s=back?1.45:1;
  const disk=(rx:number,ry:number,y:number)=>patch(parent,color,Array.from({length:20},(_,i)=>[cx+Math.cos(i/20*Math.PI*2)*rx*s,y+Math.sin(i/20*Math.PI*2)*ry*s] as const),surface,back,.010);
  disk(.009,.022,cy-.005);disk(.007,.009,cy+.020*s);
  for(const side of [-1,1])for(const [root,bend,tip] of [
    [[.006,.009],[.033,.034],[.037,.055]],[[.007,.004],[.043,.022],[.052,.035]],
    [[.008,-.004],[.046,-.011],[.054,-.036]],[[.006,-.012],[.032,-.031],[.035,-.057]],
  ] as const)stroke(parent,color,[root,bend,tip].map(([x,y])=>[side*x*s,cy+y*s] as const),surface,back?.007:.0035,back,.010);
}

export function addSpiderOutfit(parent:THREE.Group,front:(x:number,y:number)=>number,back:(x:number,y:number)=>number) {
  const panel:Point2[]=[[-.060,.421],[.060,.421],[.124,.397],[.102,.301],[.065,.193],[.061,.090],[-.061,.090],[-.065,.193],[-.102,.301],[-.124,.397]];
  patch(parent,RED,panel,front,false,.006,3);
  patch(parent,RED,[[-.060,.421],[.060,.421],[.125,.397],[.115,.372],[-.115,.372],[-.125,.397]],back,true,.006,2);
  patch(parent,RED,[[-.130,.071],[.130,.071],[.127,.104],[-.127,.104]],front,false,.006,2);
  for(const x of [-.09,-.045,0,.045,.09]) {
    const start=Math.abs(x)>.08?.28:.11;
    stroke(parent,INK,[[x,start],[x,.40]],front,.0015,false,.008);
  }
  for(const y of [.143,.202,.261,.320,.379]) {
    const width=y<.21?.06:y<.31?.08:.10;
    stroke(parent,INK,[[-width,y],[-width*.5,y-.009],[0,y], [width*.5,y-.009],[width,y]],front,.0015,false,.008);
  }
  spider(parent,front,false);spider(parent,back,true);
  mesh(parent,new THREE.CylinderGeometry(.046,.050,.068,16,1,true),RED,0,.440,0);
}

function limbWeb(parent:THREE.Group,radius:number|((y:number)=>number),start:number,end:number,angles:readonly[number,number]=[0,Math.PI*2]) {
  const at=(y:number)=>typeof radius==='number'?radius:radius(y);
  for(let i=0;i<6;i++) {
    const a=THREE.MathUtils.lerp(angles[0],angles[1],i/5);
    const point=(t:number,angle:number)=>{const y=start+(end-start)*t;return new THREE.Vector3(Math.sin(angle)*at(y),y,Math.cos(angle)*at(y));};
    strip(parent,3,t=>point(t,a-.020),t=>point(t,a+.020));
  }
  for(const fraction of [.13,.39,.65,.91]) {
    const y=start+(end-start)*fraction;
    const point=(t:number,offset:number)=>{const angle=THREE.MathUtils.lerp(angles[0],angles[1],t);return new THREE.Vector3(Math.sin(angle)*at(y+offset),y+offset,Math.cos(angle)*at(y+offset));};
    strip(parent,24,t=>point(t,-.003),t=>point(t,.003));
  }
}

export function addSpiderLimb(parent:THREE.Group,kind:'upperarm'|'forearm'|'shin',side:number) {
  if(kind==='forearm') {
    mesh(parent,new THREE.CylinderGeometry(.034,.034,.99,12,1,true),RED);limbWeb(parent,.0355,-.49,.49);
  } else if(kind==='shin') {
    mesh(parent,new THREE.CylinderGeometry(.055,.055,.56,12,1,true),RED,0,.23,0);
    limbWeb(parent,.056,-.04,.49);
  } else {
    // Red outer shoulders over a continuous blue undersuit; no short-shirt sleeve edge.
    const panel=new THREE.CylinderGeometry(.048,.043,.75,12,1,true,side===1?0:Math.PI,Math.PI);
    mesh(parent,panel,RED,0,-.12,0);
    limbWeb(parent,y=>.0445+.005*THREE.MathUtils.clamp((y+.495)/.75,0,1),-.48,.24,side===1?[0,Math.PI]:[Math.PI,Math.PI*2]);
  }
}

export function addSpiderShoe(parent:THREE.Group) {
  mesh(parent,new RoundedBoxGeometry(.104,.028,.159,2,.009),RED,0,.054,-.021);
  for(const z of [-.075,-.035,.005])mesh(parent,new THREE.BoxGeometry(.084,.0014,.0015),INK,0,.069,z);
}
