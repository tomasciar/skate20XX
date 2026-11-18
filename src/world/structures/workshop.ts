import * as THREE from 'three';
import {sceneryMaterial} from '../props/variety.ts';
import {COURSE_STEP} from '../terrain/course.ts';
import {LANDMARK_MATERIALS,landmarkBox,landmarkPart} from './parts.ts';

export const ROOFTOP={x:5.25,width:4.5,start:3,rampEnd:38,end:64,height:2.4} as const;
const {brick:wall,steel,trim,roof,glass,dark,concrete}=LANDMARK_MATERIALS;
const ridingRoof=sceneryMaterial(0x92958b,0,.92,'roof');
ridingRoof.polygonOffset=true;ridingRoof.polygonOffsetFactor=-1;ridingRoof.polygonOffsetUnits=-2;

/** An eased access ramp joins the roof at exactly the same height and tangent. */
export function rooftopHeight(along:number) {
  const t=THREE.MathUtils.clamp((along-ROOFTOP.start)/(ROOFTOP.rampEnd-ROOFTOP.start),0,1);
  return ROOFTOP.height*t*t*t*(10+t*(-15+6*t));
}

/** Hill-frame meshes are warped with the road before joining the static batches and collider. */
export function makeRooftopLane(globalStart:number) {
  const meshes:THREE.Mesh[]=[],points:number[]=[],indices:number[]=[];
  const rows:number[]=[ROOFTOP.start,ROOFTOP.rampEnd,ROOFTOP.end];
  for(let s:number=ROOFTOP.start;s<ROOFTOP.end;s+=.5)rows.push(s);
  for(let s=Math.ceil((globalStart+ROOFTOP.start)/COURSE_STEP)*COURSE_STEP-globalStart;s<ROOFTOP.end;s+=COURSE_STEP)rows.push(s);
  rows.sort((a,b)=>a-b);const samples=rows.filter((s,i)=>!i || s-rows[i-1]!>1e-7);
  for(const s of samples)for(const x of [ROOFTOP.x-ROOFTOP.width/2,ROOFTOP.x+ROOFTOP.width/2])points.push(x,.5+rooftopHeight(s),-s);
  const n=points.length/3;
  for(let i=0;i<n;i++) {
    const s=-points[i*3+2]!;
    // Fill the approach down to the road, rather than leaving a floating ribbon.
    points.push(points[i*3]!,s<=ROOFTOP.rampEnd?.42:points[i*3+1]!-.12,points[i*3+2]!);
  }
  for(let i=0;i<samples.length-1;i++) {
    const a=i*2,b=a+1,c=a+2,d=a+3;
    indices.push(a,b,c,b,d,c,a+n,c+n,b+n,b+n,c+n,d+n);
    indices.push(a,c,a+n,c,c+n,a+n,b,b+n,d,d,b+n,d+n);
  }
  indices.push(0,n,1,1,n,n+1,n-2,n-1,2*n-2,n-1,2*n-1,2*n-2);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const deck=new THREE.Mesh(geometry,ridingRoof);deck.name='rooftop-line';meshes.push(deck);
  const box=(material:THREE.MeshStandardMaterial,size:number[],at:number[],decorative=false)=>{
    const mesh=landmarkBox(material,size,at,decorative,true);meshes.push(mesh);return mesh;
  };
  const length=ROOFTOP.end-ROOFTOP.rampEnd,center=(ROOFTOP.end+ROOFTOP.rampEnd)/2;
  box(wall,[6.8,2.78,length],[11.05,1.39,-center]);
  box(dark,[6.9,.48,length+.12],[11.05,.22,-center],true);
  box(roof,[8.25,.18,length],[11.625,.5+ROOFTOP.height-.09,-center]);
  for(let s=ROOFTOP.rampEnd+2;s<ROOFTOP.end;s+=5.5) {
    box(concrete,[.18,2.8,.22],[7.57,1.4,-s],true);
    box(dark,[.09,1.92,3.9],[7.6,1.38,-s-2.7],true);
    box(steel,[.045,1.7,3.6],[7.53,1.4,-s-2.7],true);
    for(let y=.8;y<2.1;y+=.28)box(concrete,[.04,.035,3.5],[7.5,y,-s-2.7],true);
    box(trim,[.22,.14,4.05],[7.55,2.43,-s-2.7],true);
    // Raised glazing sits on the outer part of the roof; the whole riding lane remains open.
    box(steel,[2.25,.65,2.9],[12,3.15,-s-1]);
    const pane=box(glass,[2.05,.04,2.65],[12,3.51,-s-1],true);pane.rotation.x=.15;
    box(trim,[2.4,.09,.1],[12,3.6,-s+0.4],true);
  }
  box(trim,[.18,.3,length],[15.7,3.03,-center]);
  box(trim,[.22,.16,length],[7.4,3.04,-center],true);
  // Concrete edge joints and a broad foot support make the approach feel built into the yard.
  for(const s of [9,17,25,33]) {
    const h=rooftopHeight(s);
    box(concrete,[.17,Math.max(.12,h),.24],[7.58,.5+h/2,-s],true);
  }
  // Continue the workshop underneath the rising approach, rather than attaching
  // an isolated ramp ribbon to a small box at the very end.
  const approach=new THREE.BufferGeometry(),v:number[]=[],ix:number[]=[];
  const approachRows=Array.from({length:27},(_,i)=>12+i);
  for(const bottom of [false,true])for(const s of approachRows)for(const x of [7.5,15.75])v.push(x,bottom?.1:.5+rooftopHeight(s)-.01,-s);
  const count=approachRows.length*2;
  for(let row=0;row<approachRows.length-1;row++) {
    const a=row*2,b=a+1,c=a+2,d=a+3;
    ix.push(a,b,c,b,d,c,a+count,c+count,b+count,b+count,c+count,d+count);
    ix.push(a,c,a+count,c,c+count,a+count,b,b+count,d,d,b+count,d+count);
  }
  ix.push(0,count,1,1,count,count+1,count-2,count-1,2*count-2,count-1,2*count-1,2*count-2);
  approach.setAttribute('position',new THREE.Float32BufferAttribute(v,3));approach.setIndex(ix);approach.computeVertexNormals();
  meshes.push(landmarkPart(approach,wall));
  const cap=new THREE.BufferGeometry(),capPoints=v.slice(0,count*3),capIndices:number[]=[];
  for(let i=1;i<capPoints.length;i+=3)capPoints[i]!+=.01;
  for(let row=0;row<approachRows.length-1;row++){const a=row*2;capIndices.push(a,a+1,a+2,a+1,a+3,a+2);}
  cap.setAttribute('position',new THREE.Float32BufferAttribute(capPoints,3));cap.setIndex(capIndices);cap.computeVertexNormals();
  meshes.push(landmarkPart(cap,ridingRoof));
  for(const s of [19,25,31,36]) {
    const h=rooftopHeight(s),y=.5+h/2;
    box(concrete,[.18,h,.23],[7.43,y,-s],true);
    if(h>1)box(dark,[.08,h*.5,3.2],[7.46,y,-s+2],true);
  }
  return meshes;
}

