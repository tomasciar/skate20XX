import * as THREE from 'three';
import {COURSE_STEP} from './course.ts';

export type RampShape={kind:'curved'|'bank';width:number;length:number;height:number;side:-1|1};

/** u runs from the inner edge toward the outer verge; t always runs downhill. */
export function rampShapeHeight(shape:RampShape,u:number,t:number) {
  return shape.height*t*t*(shape.kind==='bank'?u*u:1);
}

/** Closed solids: the visible riding surface is also the triangle collision surface. */
export function createRampShapeGeometry(shape:RampShape,globalStart=0) {
  const columns=shape.kind==='bank'?8:1,steps=Math.ceil(shape.length/0.4);
  const rows=Array.from({length:steps+1},(_,i)=>i/steps);
  // Retain every road-profile seam so the low inner edge stays flush on rolling terrain.
  for(let along=Math.ceil(globalStart/COURSE_STEP)*COURSE_STEP;along<globalStart+shape.length;along+=COURSE_STEP) {
    const t=(along-globalStart)/shape.length;if(t>0 && t<1)rows.push(t);
  }
  rows.sort((a,b)=>a-b);
  const samples=rows.filter((t,i)=>i===0 || t-rows[i-1]!>1e-8);
  const positions:number[]=[],indices:number[]=[];
  const xAt=(col:number)=>shape.width*(col/columns-0.5);
  const heightAt=(col:number,t:number)=>rampShapeHeight(shape,shape.side>0?col/columns:1-col/columns,t);
  for(const bottom of [false,true])for(const t of samples)for(let col=0;col<=columns;col++) {
    positions.push(xAt(col),bottom?-0.08:heightAt(col,t),shape.length*(0.5-t));
  }
  const count=samples.length*(columns+1);
  for(let row=0;row<samples.length-1;row++)for(let col=0;col<columns;col++) {
    const a=row*(columns+1)+col,b=a+1,c=a+columns+1,d=c+1;
    indices.push(a,b,c,b,d,c,a+count,c+count,b+count,b+count,c+count,d+count);
  }
  const point=(col:number,row:number,bottom=false)=>[xAt(col),bottom?-0.08:heightAt(col,samples[row]!),shape.length*(0.5-samples[row]!)];
  function quad(a:number[],b:number[],c:number[],d:number[]) {
    const at=positions.length/3;positions.push(...a,...b,...c,...d);indices.push(at,at+1,at+2,at,at+2,at+3);
  }
  const last=samples.length-1;
  for(let col=0;col<columns;col++) {
    quad(point(col+1,0),point(col,0),point(col,0,true),point(col+1,0,true));
    quad(point(col,last),point(col+1,last),point(col+1,last,true),point(col,last,true));
  }
  for(let row=0;row<last;row++) {
    quad(point(0,row),point(0,row+1),point(0,row+1,true),point(0,row,true));
    quad(point(columns,row+1),point(columns,row),point(columns,row,true),point(columns,row+1,true));
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

/** Cut paint directly from the riding triangles so it follows both bends and road seams exactly. */
function stripe(surface:THREE.BufferGeometry,x0:number,x1:number,z0:number,z1:number) {
  const positions:number[]=[],indices:number[]=[],vertices=surface.getAttribute('position'),index=surface.index!;
  function clip(polygon:THREE.Vector3[],axis:'x'|'z',edge:number,sign:number) {
    const result:THREE.Vector3[]=[];
    if(!polygon.length)return result;
    let previous=polygon[polygon.length-1]!,before=(previous[axis]-edge)*sign;
    for(const current of polygon) {
      const after=(current[axis]-edge)*sign;
      if((before>=0)!==(after>=0))result.push(previous.clone().lerp(current,before/(before-after)));
      if(after>=0)result.push(current);
      previous=current;before=after;
    }
    return result;
  }
  for(let i=0;i<index.count;i+=3) {
    const triangle=[0,1,2].map(offset=>new THREE.Vector3().fromBufferAttribute(vertices,index.getX(i+offset)));
    // The closed base and side walls each include vertices below the riding surface.
    if(triangle.some(point=>point.y<0))continue;
    if(triangle.every(point=>point.x<x0) || triangle.every(point=>point.x>x1) ||
      triangle.every(point=>point.z<z0) || triangle.every(point=>point.z>z1))continue;
    let polygon=clip(triangle,'x',x0,1);polygon=clip(polygon,'x',x1,-1);
    polygon=clip(polygon,'z',z0,1);polygon=clip(polygon,'z',z1,-1);
    if(polygon.length<3)continue;
    const start=positions.length/3;
    for(const point of polygon)positions.push(point.x,point.y+0.004,point.z);
    for(let j=1;j<polygon.length-1;j++)indices.push(start,start+j,start+j+1);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export function makeRampShape(shape:RampShape,material:THREE.Material,trim:THREE.Material,globalStart=0) {
  const deck=new THREE.Mesh(createRampShapeGeometry(shape,globalStart),material);
  const lip=new THREE.Mesh(stripe(deck.geometry,-shape.width/2,shape.width/2,-shape.length/2,-shape.length/2+0.28),trim);
  lip.userData.collision=false;
  const meshes=[deck,lip];
  for(const side of [-1,1]) {
    const edge=side*(shape.width/2-0.13);
    const guide=new THREE.Mesh(stripe(deck.geometry,edge-0.045,edge+0.045,-shape.length/2,shape.length/2),trim);
    guide.userData.collision=false;meshes.push(guide);
  }
  return meshes;
}
