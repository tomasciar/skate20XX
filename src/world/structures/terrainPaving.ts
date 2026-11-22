import * as THREE from 'three';
import {LANDSCAPE_X,landscapeHeight} from '../terrain/landscape.ts';
import {courseHeight} from '../terrain/course.ts';

import {clip,type Vertex} from './clipPolygon.ts';
import {branchRoadAt,branchRoadX} from '../planning/branchRoads.ts';

/** A shared forecourt follows the exact terrain triangles, rather than separate isolated prop foundations. */
export function makeTerrainPaving(index:number,near:number,far:number,start:number,end:number,material:THREE.Material) {
  const base=index*70,positions:number[]=[],uv:number[]=[];
  for(let a=base;a<base+70;a+=5) {
    if(a+5<=start||a>=end)continue;
    const branch=branchRoadAt(a+2.5);
    const entry=branch?branchRoadX(branch,a):0,exit=branch?branchRoadX(branch,a+5):0;
    const center=(s:number)=>entry+(exit-entry)*(s-a)/5;
    for(let i=0;i<LANDSCAPE_X.length-1;i++) {
      const x=LANDSCAPE_X[i]!,next=LANDSCAPE_X[i+1]!;if(next<near||x>far)continue;
      const p:Vertex=[x,landscapeHeight(x,a),a],q:Vertex=[next,landscapeHeight(next,a),a];
      const r:Vertex=[x,landscapeHeight(x,a+5),a+5],t:Vertex=[next,landscapeHeight(next,a+5),a+5];
      for(const triangle of [[p,q,r],[q,t,r]]) {
        let patch=clip(triangle,v=>v[0]-near);
        patch=clip(patch,v=>far-v[0]);patch=clip(patch,v=>v[2]-start);patch=clip(patch,v=>end-v[2]);
        if(patch.length<3)continue;
        // At a junction the branch owns its footprint, including its painted lane edges.
        const pieces=branch && next>=Math.min(entry,exit)-branch.width/2 && x<=Math.max(entry,exit)+branch.width/2
          ? [clip(patch,v=>center(v[2])-branch.width/2-v[0]),clip(patch,v=>v[0]-center(v[2])-branch.width/2)]
          : [patch];
        for(const poly of pieces)for(let j=1;j<poly.length-1;j++)for(const v of [poly[0]!,poly[j]!,poly[j+1]!]) {
          positions.push(v[0],v[1]-courseHeight(v[2])+.018,-(v[2]-base));uv.push(v[0]/8,v[2]/8);
        }
      }
    }
  }
  if(!positions.length)return null;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,material);mesh.name='foundry-connected-paving';mesh.userData.collision=false;return mesh;
}
