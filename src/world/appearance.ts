import * as THREE from 'three';
import type {WorldSeason} from './season.ts';
import {seededRandom} from './generation.ts';

export type Surface='scenery'|'road'|'terrain'|'path'|'barrier'|'line'|'obstacle';
export function surface<T extends THREE.Material>(material:T,kind:Surface):T {material.userData.surface=kind;return material;}

/** Keep thin glazing ahead of its backing wall even when distant depth values quantize together. */
export function facadeMaterial<T extends THREE.Material>(material:T):T {
  material.polygonOffset=true;material.polygonOffsetFactor=0;material.polygonOffsetUnits=-2;return material;
}

/** Newly added props get winter support automatically; explicit surface roles take precedence. */
export function prepareEnvironmentObject(root:THREE.Object3D) {
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    for(const material of Array.isArray(object.material)?object.material:[object.material]) {
      if(!material.userData.surface)surface(material,'scenery');
    }
  });
}

/** Upward-facing roofs, branches and rocks get snow without extra meshes or colliders. */
function snowCoating(material:THREE.MeshStandardMaterial,source:THREE.Material) {
  const compile=source.onBeforeCompile,key=source.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vSnowUp;')
      .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nvSnowUp = normalize(mat3(modelMatrix) * objectNormal).y;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vSnowUp;')
      .replace('#include <color_fragment>',`#include <color_fragment>
        float snowCover = smoothstep(0.35, 0.84, vSnowUp) * 0.97;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.90, 0.98), snowCover);`);
  };
  material.customProgramCacheKey=()=> `${key}|snow-coating-v1`;
}

function snowTexture(packed:boolean) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const g=canvas.getContext('2d')!,rng=seededRandom(packed?904:905);
  if(typeof CanvasRenderingContext2D!=='undefined' && g instanceof CanvasRenderingContext2D) {
    g.fillStyle=packed?'#dfedf2':'#f1f7fa';g.fillRect(0,0,512,512);
    for(let i=0;i<5500;i++) {
      g.fillStyle=`rgba(${rng()<0.5?'104,145,173':'255,255,255'},${0.03+rng()*0.08})`;
      g.fillRect(rng()*512,rng()*512,1+rng()*2,1+rng()*2);
    }
    if(packed) {
      for(let x=0;x<512;x+=8){g.fillStyle='rgba(106,148,176,0.08)';g.fillRect(x,0,1,512);}
      for(const x of [154,330]) {
        const track=g.createLinearGradient(x-8,0,x+8,0);
        track.addColorStop(0,'rgba(103,151,181,0)');track.addColorStop(0.5,'rgba(103,151,181,0.13)');track.addColorStop(1,'rgba(103,151,181,0)');
        g.fillStyle=track;g.fillRect(x-8,0,16,512);
      }
    }
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(1,packed?5:1);texture.anisotropy=8;
  return texture;
}

/** Per-world cached winter materials. Skate materials and all geometry remain intact. */
export function createWorldAppearance(initial:WorldSeason='summer') {
  let season=initial,packed:THREE.Texture|undefined,powder:THREE.Texture|undefined;
  const winter=new Map<THREE.Material,THREE.Material>(),sources=new WeakMap<THREE.Mesh,THREE.Material>();
  function materialFor(source:THREE.Material) {
    const role=source.userData.surface as Surface|undefined;
    if(season==='summer' || !role || role==='obstacle' || source.userData.perChunk)return source;
    let result=winter.get(source);
    if(result)return result;
    if(!(source instanceof THREE.MeshStandardMaterial || source instanceof THREE.MeshBasicMaterial))return source;
    const clone=source.clone();
    if(role==='road') {clone.color.setHex(0xf3f8fb);clone.map=packed ??=snowTexture(true);}
    else if(role==='line')clone.color.setHex(0x658da5);
    else if(role==='path')clone.color.setHex(0xd4e7ef);
    else if(role==='barrier')clone.color.setHex(0x657e91);
    if(clone instanceof THREE.MeshStandardMaterial) {
      clone.roughness=1;clone.metalness=0;
      if(role==='terrain')clone.map=powder ??=snowTexture(false);
      if(role!=='road')snowCoating(clone,source);
    }
    winter.set(source,clone);return clone;
  }
  function bind(mesh:THREE.Mesh,source:THREE.Material){sources.set(mesh,source);mesh.material=materialFor(source);}
  function setSeason(next:WorldSeason,root:THREE.Object3D) {
    season=next;
    root.traverse(object=>{if(object instanceof THREE.Mesh){const source=sources.get(object);if(source)object.material=materialFor(source);}});
  }
  return {bind,setSeason,materialFor,get season(){return season;}};
}
