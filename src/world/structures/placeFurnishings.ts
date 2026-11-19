import * as THREE from 'three';
import {CHUNK_LENGTH} from '../planning/generation.ts';
import type {PlaceSite} from '../planning/places.ts';
import {LANDMARK_MATERIALS as M,landmarkBox,landmarkPart,sharedGeometry} from './parts.ts';
import {unitGable} from '../props/parts.ts';
import {makeShopSign} from '../props/city.ts';

const cylinder=sharedGeometry(new THREE.CylinderGeometry(1,1,1,10));
const shrub=sharedGeometry(new THREE.IcosahedronGeometry(1,0));
const cone=sharedGeometry(new THREE.ConeGeometry(1,1,10));

/** Larger, recognizable furnishings sit outside the connected riding lines. */
export function* makePlaceFurnishings(index:number,site:PlaceSite) {
  const from=index*CHUNK_LENGTH,s=site.start,side=site.side;
  const owns=(along:number)=>along>=from && along<from+CHUNK_LENGTH;
  const box=(material:THREE.MeshStandardMaterial,size:number[],at:number[],name:string,solid=true,anchor?:number,tint?:number)=>{
    const mesh=landmarkBox(material,size,[side*at[0]!,at[1]!,-(at[2]!-from)],!solid,true);
    mesh.name=name;if(anchor!==undefined)mesh.userData.levelBase=anchor;
    if(tint!==undefined)mesh.userData.sceneryTint=tint;return mesh;
  };
  const shape=(geometry:THREE.BufferGeometry,material:THREE.MeshStandardMaterial,size:number[],at:number[],name:string,anchor?:number,tint?:number)=>{
    const mesh=landmarkPart(geometry,material);mesh.scale.set(size[0]!,size[1]!,size[2]!);
    mesh.position.set(side*at[0]!,at[1]!,-(at[2]!-from));mesh.name=name;
    if(anchor!==undefined)mesh.userData.levelBase=anchor;if(tint!==undefined)mesh.userData.sceneryTint=tint;return mesh;
  };
  if(site.kind==='plaza') {
    for(const along of [s+65,s+125,s+185])if(owns(along)) {
      // Closed stone arches span the lane with generous headroom; only the feet touch the ground.
      const positions:number[]=[],indices:number[]=[],steps=10;
      for(const z of [-.35,.35])for(let i=0;i<=steps;i++)for(const outer of [false,true]) {
        const t=i/steps,x=54+18*t,y=7.6+2.8*Math.sin(t*Math.PI);
        positions.push(side*x,y+(outer?.38:0),-(along-from)+z);
      }
      const row=(steps+1)*2;
      for(let i=0;i<steps;i++) {
        const a=i*2,b=a+2;
        for(const [p,q,r,t] of [[a,b,a+1,b+1],[a+row,a+1+row,b+row,b+1+row],[a,a+row,b,b+row],[a+1,b+1,a+1+row,b+1+row]])
          indices.push(p,q,r,q,t,r);
      }
      indices.push(0,1,row,1,1+row,row);const end=steps*2;
      indices.push(end,end+row,end+1,end+1,end+row,end+1+row);
      if(side>0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2]!,indices[i+1]!];
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
      const arch=landmarkPart(geometry,M.brick);arch.name='plaza-stone-arch';yield arch;
      for(const [distance,base] of [[54,.46],[72,2.36]]) {
        yield box(M.trim,[.6,7.6-base,.7],[distance,(7.6+base)/2,along],'plaza-arch-pier');
        yield box(M.brick,[1,.25,1],[distance,base+.005,along],'plaza-arch-foot');
      }
    }
    for(let along=s+50;along<site.end-40;along+=30)if(owns(along))for(const distance of [96.9,99.1]) {
      yield shape(shrub,M.paint,[.8,.55,1.05],[distance,5.59,along+1.8],'plaza-planted-border',undefined,0x6f8c48);
      yield shape(shrub,M.paint,[.35,.25,.4],[distance,6.02,along+1.8],'plaza-flower-cluster',undefined,site.seed%2?0xd6ab52:0xb96b89);
    }
    const kiosk=s+125;
    if(owns(kiosk)) {
      yield box(M.paint,[5.6,3.3,7],[82,4.71,kiosk],'plaza-cafe-kiosk',true,undefined,0x6e9187);
      yield shape(unitGable,M.roof,[6.3,1.2,7.5],[82,6.36,kiosk],'plaza-kiosk-roof');
      yield box(M.dark,[.12,1.55,4.6],[79.15,4.8,kiosk],'plaza-kiosk-service-window',false);
      yield box(M.trim,[1.1,.14,5.2],[78.7,4.04,kiosk],'plaza-kiosk-counter');
      for(const offset of [-2.3,0,2.3])yield box(M.trim,[.16,1.7,.12],[79.05,4.8,kiosk+offset],'plaza-kiosk-window-frame',false);
      yield box(M.paint,[2.7,.18,6.4],[78.35,6.05,kiosk],'plaza-kiosk-awning',true,undefined,0xc37846);
      for(let stripe=0;stripe<6;stripe++)yield box(M.trim,[2.65,.025,.45],[78.35,6.15,kiosk-2.75+stripe*1.1],'plaza-kiosk-awning-stripe',false);
      const sign=makeShopSign(0,4.6);sign.position.set(side*79.02,5.75,-(kiosk-from));sign.rotation.y=-side*Math.PI/2;sign.name='plaza-cafe-sign';yield sign;
    }
    for(const along of [s+95,s+155])if(owns(along)) {
      yield shape(cylinder,M.steel,[.12,.9,.12],[85.5,3.51,along],'plaza-cafe-table-leg');
      yield shape(cylinder,M.trim,[.9,.12,.9],[85.5,4.02,along],'plaza-cafe-tabletop');
      for(const d of [84.1,86.9]) {
        yield box(M.paint,[.65,.12,.65],[d,3.55,along],'plaza-cafe-chair',true,undefined,0x397e7b);
        for(const offset of [-.23,.23])yield box(M.steel,[.08,.43,.55],[d+offset,3.275,along],'plaza-chair-frame');
        yield box(M.paint,[.65,.6,.10],[d,3.87,along+.28],'plaza-chair-back',true,undefined,0x397e7b);
      }
    }
  } else if(site.kind==='highrise') {
    const along=s+150;
    if(owns(along)) {
      yield box(M.concrete,[5.4,3.2,6.4],[30.5,8.86,along],'parking-stair-house');
      yield shape(unitGable,M.roof,[6,1.3,7],[30.5,10.46,along],'parking-stair-roof');
      yield box(M.steel,[.10,2.35,1.5],[27.75,8.5,along],'parking-stair-door',false);
      yield box(M.glass,[.06,.6,3.9],[33.24,9.45,along],'parking-stair-window',false);
    }
  } else {
    // Stacked containers have shallow concrete foundations rather than floating above the hillside.
    for(const [along,tint] of [[s+58,0xa8563d],[s+282,0x517f80]])if(owns(along)) {
      const anchor=along-1.5;
      yield box(M.concrete,[12.5,.9,3.2],[137,.01,along],'yard-container-foundation',true,anchor);
      for(const level of [0,1]) {
        yield box(M.steel,[12,2.6,2.9],[137,1.76+level*2.6,along],'yard-shipping-container',true,anchor,tint);
        yield box(M.trim,[12.15,.12,3],[137,3.06+level*2.6,along],'yard-container-top-rail',false,anchor);
        for(const d of [131.4,136.8,137.2,142.6])yield box(M.trim,[.10,2.4,.06],[d,1.76+level*2.6,along-1.49],'yard-container-door-lock',false,anchor);
      }
    }
    const silos=s+203;
    if(owns(silos))for(const distance of [135.5,142]) {
      yield box(M.concrete,[5.7,2,5.7],[distance,-.54,silos],'yard-silo-foundation',true,silos);
      yield shape(cylinder,M.steel,[2.6,10,2.6],[distance,5.46,silos],'yard-storage-silo',silos,0xc0bbaa);
      yield shape(cone,M.roof,[2.85,1.6,2.85],[distance,11.26,silos],'yard-silo-cap',silos);
      for(const y of [1.2,5.4,9.7])yield shape(cylinder,M.steel,[2.68,.14,2.68],[distance,y,silos],'yard-silo-band',silos,0x647975);
    }
  }
}
