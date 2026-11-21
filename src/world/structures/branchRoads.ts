import * as THREE from 'three';
import {branchRoadX} from '../planning/branchRoads.ts';
import type {BranchRoad} from '../planning/branchRoads.ts';
import {CHUNK_LENGTH} from '../planning/generation.ts';
import {COURSE_STEP,courseHeight} from '../terrain/course.ts';
import {LANDSCAPE_X,landscapeHeight} from '../terrain/landscape.ts';

type Vertex=[number,number,number];
function clip(polygon:Vertex[],distance:(v:Vertex)=>number) {
  const result:Vertex[]=[];
  for(let i=0;i<polygon.length;i++) {
    const a=polygon[i]!,b=polygon[(i+1)%polygon.length]!,da=distance(a),db=distance(b);
    if(da>=0)result.push(a);
    if((da>=0)!==(db>=0)) {
      const t=da/(da-db);result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]);
    }
  }
  return result;
}

/** Clip the actual terrain triangles, rather than bridging above them with a second collision surface. */
function skin(index:number,road:BranchRoad,offset:number,width:number,lift:number,dashed=false) {
  const from=index*CHUNK_LENGTH,positions:number[]=[],uv:number[]=[];
  for(let along=from;along<from+CHUNK_LENGTH;along+=COURSE_STEP) {
    const end=along+COURSE_STEP;
    if(end<=road.start || along>=road.end || (dashed && Math.floor(along/10)%2!==0))continue;
    const first=branchRoadX(road,along)+offset,last=branchRoadX(road,end)+offset;
    const center=(s:number)=>first+(last-first)*(s-along)/COURSE_STEP;
    for(let col=0;col<LANDSCAPE_X.length-1;col++) {
      const x0=LANDSCAPE_X[col]!,x1=LANDSCAPE_X[col+1]!;
      if(x1<Math.min(first,last)-width/2 || x0>Math.max(first,last)+width/2)continue;
      const a:Vertex=[x0,landscapeHeight(x0,along),along],b:Vertex=[x1,landscapeHeight(x1,along),along];
      const c:Vertex=[x0,landscapeHeight(x0,end),end],d:Vertex=[x1,landscapeHeight(x1,end),end];
      for(const triangle of [[a,b,c],[b,d,c]]) {
        let polygon=clip(triangle,v=>v[0]-center(v[2])+width/2);
        polygon=clip(polygon,v=>center(v[2])+width/2-v[0]);
        polygon=clip(polygon,v=>v[2]-road.start);polygon=clip(polygon,v=>road.end-v[2]);
        // Main asphalt owns the centerline. This also avoids overlapping road/sidewalk skins.
        polygon=clip(polygon,v=>road.side*v[0]-8.32);
        for(let i=1;i<polygon.length-1;i++)for(const v of [polygon[0]!,polygon[i]!,polygon[i+1]!]) {
          positions.push(v[0],v[1]-courseHeight(v[2])+lift,-(v[2]-from));uv.push(v[0]/10,v[2]/14);
        }
      }
    }
  }
  if(!positions.length)return null;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();return geometry;
}

export function* makeBranchRoad(index:number,road:BranchRoad,asphalt:THREE.Material,marking:THREE.Material) {
  for(const [offset,width,lift,dashed] of [[0,road.width,.018,false],[-road.width/2+.45,.12,.026,false],[road.width/2-.45,.12,.026,false],[0,.18,.026,true]] as const) {
    const geometry=skin(index,road,offset,width,lift,dashed);if(!geometry)continue;
    const mesh=new THREE.Mesh(geometry,width===road.width?asphalt:marking);
    mesh.name=width===road.width?'branch-asphalt':'branch-road-marking';mesh.userData.branchId=road.id;mesh.userData.collision=false;
    mesh.receiveShadow=width===road.width;yield mesh;
  }
}

/** Footpaths open only where an actual paved branch crosses them; their support proxies use the same gaps. */
export function branchCrossesSidewalk(road:BranchRoad,side:number,along:number) {
  return side===road.side && along>=road.start && along<=road.end && Math.abs(branchRoadX(road,along)-side*10.5)<road.width/2+1.4;
}
