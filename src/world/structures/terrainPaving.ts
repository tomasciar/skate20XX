import * as THREE from 'three';
import {LANDSCAPE_X,landscapeHeight} from '../terrain/landscape.ts';
import {courseHeight} from '../terrain/course.ts';

type Vertex=[number,number,number];
function clip(points:Vertex[],axis:0|2,edge:number,sign:number) {
  const result:Vertex[]=[];
  for(let i=0;i<points.length;i++) {
    const a=points[i]!,b=points[(i+1)%points.length]!,da=(a[axis]-edge)*sign,db=(b[axis]-edge)*sign;
    if(da>=0)result.push(a);
    if((da>=0)!==(db>=0)){const t=da/(da-db);result.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),a[2]+t*(b[2]-a[2])]);}
  }
  return result;
}
/** A shared forecourt follows the exact terrain triangles, rather than separate isolated prop foundations. */
export function makeTerrainPaving(index:number,near:number,far:number,start:number,end:number,material:THREE.Material) {
  const base=index*70,positions:number[]=[],uv:number[]=[];
  for(let a=base;a<base+70;a+=5) {
    if(a+5<=start||a>=end)continue;
    for(let i=0;i<LANDSCAPE_X.length-1;i++) {
      const x=LANDSCAPE_X[i]!,next=LANDSCAPE_X[i+1]!;if(next<near||x>far)continue;
      const p:Vertex=[x,landscapeHeight(x,a),a],q:Vertex=[next,landscapeHeight(next,a),a];
      const r:Vertex=[x,landscapeHeight(x,a+5),a+5],t:Vertex=[next,landscapeHeight(next,a+5),a+5];
      for(const triangle of [[p,q,r],[q,t,r]]) {
        let poly=clip(triangle,0,near,1);poly=clip(poly,0,far,-1);poly=clip(poly,2,start,1);poly=clip(poly,2,end,-1);
        for(let j=1;j<poly.length-1;j++)for(const v of [poly[0]!,poly[j]!,poly[j+1]!]) {
          positions.push(v[0],v[1]-courseHeight(v[2])+.018,-(v[2]-base));uv.push(v[0]/8,v[2]/8);
        }
      }
    }
  }
  if(!positions.length)return null;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);mesh.name='foundry-connected-paving';mesh.userData.collision=false;return mesh;
}
