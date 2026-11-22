import * as THREE from 'three';
import type {BranchRoad} from '../planning/branchRoads.ts';
import {branchRoadX} from '../planning/branchRoads.ts';
import {branchPlayLanes,playLaneHeight,playLaneX} from '../planning/branchPlay.ts';
import {makeBranchSurface} from './branchFeatures.ts';
import {CHUNK_LENGTH} from '../planning/generation.ts';
import {courseHeight,courseX} from '../terrain/course.ts';
import {landscapeHeight} from '../terrain/landscape.ts';
import {landmarkBox,LANDMARK_MATERIALS as M} from './parts.ts';

const floor=(road:BranchRoad,s:number,offset=0)=>landscapeHeight(branchRoadX(road,s)+offset,s)-courseHeight(s);
const finishes=new WeakMap<THREE.Material,THREE.Material>();
function playFinish(material:THREE.Material) {
  let finish=finishes.get(material);
  if(!finish){finish=material.clone();finish.polygonOffset=true;finish.polygonOffsetFactor=-1;finish.polygonOffsetUnits=-2;finishes.set(material,finish);}
  return finish;
}

export function* makeBranchPlay(index:number,road:BranchRoad,finishMaterial:THREE.Material) {
  for(const lane of branchPlayLanes(road)) {
    const near=lane.offset-lane.width/2,far=lane.offset+lane.width/2;
    const spans=lane.kind==='transfer'?[[lane.start,lane.start+25],[lane.start+32,Math.min(lane.end,lane.start+77)]]:[[lane.start,lane.end]];
    for(const [a,b] of spans) {
      const mesh=makeBranchSurface(index,road,a!,b!,near,far,s=>lane.baseHeight+playLaneHeight(lane,s),lane.baseHeight?playFinish(finishMaterial):finishMaterial,{level:lane.baseHeight>0,step:1,baseHeight:lane.baseHeight>0?lane.baseHeight:undefined});
      if(mesh){mesh.name=`branch-play-${lane.baseHeight?'roof-':''}${lane.kind}`;yield mesh;}
    }
    // Attached edge bands make the low platforms legible; no raised curb crosses a riding line.
    if(lane.kind==='dock') {
      const from=index*CHUNK_LENGTH,a=Math.max(from,lane.start+25),b=Math.min(from+CHUNK_LENGTH,lane.end-25);
      if(b>a)for(const edge of [near,far]) {
        const positions:number[]=[],indices:number[]=[];
        const rows=[a];for(let s=Math.ceil(a/5)*5;s<b;s+=5)if(s>a)rows.push(s);rows.push(b);
        for(const s of rows)for(const dy of [-.27,-.10])positions.push(branchRoadX(road,s)+edge+(edge===near?-.025:.025),floor(road,s,edge)+1.15+dy,-(s-from));
        for(let i=0;i<rows.length-1;i++){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
        if(edge===far)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2]!,indices[i+1]!];
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
        const band=new THREE.Mesh(geometry,M.trim);band.name='branch-dock-edge-band';band.userData.collision=false;yield band;
      }
    }
  }
}

/** Rigid rail geometry and endpoints are already course-warped, matching the normal grind registry. */
export function makeBranchDockRail(index:number,road:BranchRoad,material:THREE.MeshStandardMaterial) {
  const lane=branchPlayLanes(road).find(lane=>lane.kind==='dock');if(!lane||lane.railStart===undefined||lane.railEnd===undefined||Math.floor(lane.railStart/CHUNK_LENGTH)!==index)return null;
  const base=index*CHUNK_LENGTH,offset=-road.side*(lane.width/2-.45);
  const point=(s:number)=>new THREE.Vector3(playLaneX(road,lane,s)+offset+courseX(s)-courseX(base),floor(road,s,lane.offset+offset)+playLaneHeight(lane,s)+.75+courseHeight(s)-courseHeight(base),-(s-base));
  const start=point(lane.railStart),end=point(lane.railEnd),tangent=end.clone().sub(start),length=tangent.length();tangent.normalize();
  const normal=new THREE.Vector3(0,1,(end.y-start.y)/(lane.railEnd-lane.railStart)).normalize();
  const right=new THREE.Vector3().crossVectors(tangent,normal).normalize();
  const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,normal,tangent.clone().negate()));
  const center=start.clone().lerp(end,.5).addScaledVector(normal,-.07);
  const top=landmarkBox(material,[.14,.14,length],center.toArray());top.quaternion.copy(rotation);top.name='branch-dock-grind-rail';
  const meshes=[top];
  for(const s of [lane.railStart+1,lane.railEnd-1]) {
    const p=start.clone().lerp(end,(s-lane.railStart)/(lane.railEnd-lane.railStart));
    const y=floor(road,s,lane.offset+offset)+playLaneHeight(lane,s)+courseHeight(s)-courseHeight(base),height=Math.max(.1,p.y-normal.y*.14-y);
    const post=landmarkBox(material,[.10,height,.10],[p.x,y+height/2,p.z]);post.name='branch-dock-rail-post';meshes.push(post);
  }
  return {meshes,rail:{id:`${road.id}:dock`,start,end,normal}};
}
