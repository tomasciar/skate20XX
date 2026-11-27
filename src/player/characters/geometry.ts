import * as THREE from 'three';
export * from './meshGeometry.ts';
import type {CharacterId} from './catalog.ts';

// Jaw, cheeks, temples, and cranium; no separate floating chin or spherical face overlay.
const HEAD=[[-0.103,0.023,0.023,-0.016],[-0.087,0.049,0.043,-0.012],[-0.052,0.071,0.062,-0.004],[-0.005,0.084,0.078,0],
  [0.045,0.086,0.078,0.004],[0.083,0.071,0.067,0.006],[0.108,0.038,0.035,0.005],[0.116,0.001,0.001,0.003]] as const;
function headSection(y:number,_id:CharacterId) {
  const profile=HEAD;let i=1;while(i<profile.length-1&&y>profile[i]![0])i++;
  const a=profile[i-1]!,b=profile[i]!,t=THREE.MathUtils.clamp((y-a[0])/(b[0]-a[0]),0,1);
  return {x:THREE.MathUtils.lerp(a[1],b[1],t),z:THREE.MathUtils.lerp(a[2],b[2],t),center:THREE.MathUtils.lerp(a[3],b[3],t)};
}
export function headHalfWidth(y:number,id:CharacterId){return headSection(y,id).x*(id==='girl'?.95:1);}
export function headContour(angle:number,y:number,id:CharacterId,offset=0) {
  const s=headSection(y,id);return new THREE.Vector3(Math.sin(angle)*(headHalfWidth(y,id)+offset),y,s.center-Math.cos(angle)*(s.z+offset));
}
export function headSurface(x:number,y:number,id:CharacterId) {
  const section=headSection(y,id);
  return section.center-section.z*Math.sqrt(Math.max(.02,1-(x/headHalfWidth(y,id))**2));
}
export function headGeometry(id:CharacterId) {
  const width=id==='girl'?.95:1;
  const rings=HEAD.map(([y,x])=>new THREE.Vector2(x,y));
  const geometry=new THREE.LatheGeometry(rings,32),p=geometry.getAttribute('position');
  for(let i=0;i<p.count;i++) {
    const section=headSection(p.getY(i),id),x=p.getX(i)*width;
    p.setX(i,x);p.setZ(i,p.getZ(i)*section.z/section.x+section.center);
  }
  geometry.computeVertexNormals();return geometry;
}

const TORSO=[[-0.18,0.13],[-0.16,0.14],[-0.11,0.138],[-0.01,0.15],[0.08,0.16],[0.145,0.163],[0.18,0.145],[0.185,0.11],[0.192,0.06]] as const;
export function torsoCenter(_y:number,_id?:CharacterId){return 0;}
export function torsoRadius(y:number,_id?:CharacterId) {
  const profile=TORSO,local=y-0.23;let i=1;while(i<profile.length-1 && local>profile[i]![0])i++;
  const a=profile[i-1]!,b=profile[i]!;return THREE.MathUtils.lerp(a[1],b[1],THREE.MathUtils.clamp((local-a[0])/(b[0]-a[0]),0,1));
}
export function torsoGeometry(id?:CharacterId) {
  const profile=TORSO;
  const geometry=new THREE.LatheGeometry(profile.map(([y,r])=>new THREE.Vector2(r,y)),24),p=geometry.getAttribute('position');
  for(let i=0;i<p.count;i++) {
    const y=p.getY(i),angle=Math.atan2(p.getX(i),p.getZ(i)),fold=1+Math.sin(angle*6+y*27)*0.012*Math.sin((y+0.18)/0.36*Math.PI);
    p.setX(i,p.getX(i)*fold);p.setZ(i,p.getZ(i)*fold+torsoCenter(y+.23,id));
  }
  geometry.computeVertexNormals();return geometry;
}
const torsoGeometries=new Map<string,THREE.BufferGeometry>();
export function characterTorsoGeometry(id:CharacterId) {
  const key='standard';let geometry=torsoGeometries.get(key);
  if(!geometry){geometry=torsoGeometry(id);torsoGeometries.set(key,geometry);}return geometry;
}
