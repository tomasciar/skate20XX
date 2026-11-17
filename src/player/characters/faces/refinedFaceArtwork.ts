import * as THREE from 'three';
import type {CharacterId} from '../catalog.ts';
import {headSurface,headHalfWidth} from '../geometry.ts';
import {batchCosmetics} from '../cosmetics.ts';

export const REFINED_FACE_ARTWORK={
  finn:{url:new URL('../../../assets/faces/finn.png',import.meta.url).href,width:.285,height:.109,top:.044,eyeV:.7012,mouthV:.797,eyeY:.004,mouthY:-.035},
  bart:{url:new URL('../../../assets/faces/bart.png',import.meta.url).href,width:.224,height:.220,top:.087,eyeV:.456,mouthV:.786,eyeY:-.006,mouthY:-.080},
  shaggy:{url:new URL('../../../assets/faces/shaggy.png',import.meta.url).href,width:.180,height:.210,top:.068,eyeV:.344,mouthV:.704,eyeY:-.015,mouthY:-.085},
  light:{url:new URL('../../../assets/faces/light.png',import.meta.url).href,width:.160,height:.163,top:.047,eyeV:.379,mouthV:.78,eyeY:-.013,mouthY:-.073},
  peter:{url:new URL('../../../assets/faces/peter.png',import.meta.url).href,width:.220,height:.245,top:.093,eyeV:.356,mouthV:.655,eyeY:.007,mouthY:-.077},
  sasuke:{url:new URL('../../../assets/faces/sasuke.png',import.meta.url).href,width:.158,height:.177,top:.060,eyeV:.416,mouthV:.768,eyeY:-.013,mouthY:-.071},
  onizuka:{url:new URL('../../../assets/faces/onizuka.png',import.meta.url).href,width:.155,height:.180,top:.054,eyeV:.375,mouthV:.774,eyeY:-.013,mouthY:-.075},
} as const;
export type RefinedFace=keyof typeof REFINED_FACE_ARTWORK;
export function isRefinedFace(id:CharacterId):id is RefinedFace{return id in REFINED_FACE_ARTWORK;}
type State={material:THREE.MeshBasicMaterial;fallback:THREE.MeshStandardMaterial;ready:boolean;loading?:Promise<void>};
const cache=new Map<RefinedFace,State>();
function state(id:RefinedFace) {
  let entry=cache.get(id);
  if(!entry) {
    const texture=new THREE.DataTexture(new Uint8Array(4),1,1,THREE.RGBAFormat);texture.needsUpdate=true;
    const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.12,depthWrite:false,toneMapped:false});
    material.name=`face-artwork-${id}`;material.userData.faceArtwork=id;material.visible=false;
    material.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
        #ifdef USE_MAP
          vec4 stamp = texture2D(map, vMapUv);
          vec2 inkStep = min(vec2(0.010), max(vec2(0.0015), fwidth(vMapUv) * 0.24));
          float ink = 0.0;
          for (int axis = 0; axis < 4; axis++) {
            vec2 direction = axis == 0 ? vec2(1.0,0.0) : axis == 1 ? vec2(-1.0,0.0) : axis == 2 ? vec2(0.0,1.0) : vec2(0.0,-1.0);
            vec4 neighbor = texture2D(map, vMapUv + direction * inkStep);
            float dark = 1.0 - smoothstep(0.12, 0.28, max(neighbor.r,max(neighbor.g,neighbor.b)));
            ink = max(ink, neighbor.a * step(0.7,neighbor.a) * dark * 0.90);
          }
          float added = ink * (1.0 - stamp.a);
          float alpha = stamp.a + added;
          stamp.rgb = (stamp.rgb * stamp.a + vec3(0.008) * added) / max(alpha,0.0001);
          stamp.a = alpha;
          diffuseColor *= stamp;
        #endif
      `);
    };
    material.customProgramCacheKey=()=> 'refined-decal-ink-v1';material.userData.boldInk=true;
    const fallback=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82});fallback.name=`face-fallback-${id}`;
    entry={material,fallback,ready:false};cache.set(id,entry);
  }
  return entry;
}
export function refinedFaceMaterial(id:RefinedFace){return state(id).material;}
/** Shared materials switch every live rider, portrait and crash clone together after loading. */
export function nativeFaceDetails(parent:THREE.Group,id:RefinedFace) {
  const group=new THREE.Group();group.name=`face-fallback-${id}`;group.userData.faceFallback=id;parent.add(group);return group;
}
export function finishNativeFaceDetails(group:THREE.Group,id:RefinedFace) {
  batchCosmetics(group);const material=state(id).fallback;
  group.traverse(object=>{if(object instanceof THREE.Mesh)object.material=material;});
}
export function preloadRefinedFace(id:RefinedFace):Promise<void> {
  const entry=state(id);if(entry.ready)return Promise.resolve();if(entry.loading)return entry.loading;
  entry.loading=new Promise<void>(resolve=>{
    try {new THREE.TextureLoader().load(REFINED_FACE_ARTWORK[id].url,texture=>{
      const image=texture.image as HTMLImageElement,ratio=Math.min(1,512/Math.max(image.width,image.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));
      const ctx=canvas.getContext('2d');if(ctx){ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,canvas.width,canvas.height);(texture as THREE.Texture).image=canvas;}
      texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;texture.minFilter=THREE.LinearMipmapLinearFilter;
      texture.name=`face-artwork-${id}`;texture.needsUpdate=true;
      const old=entry.material.map;entry.material.map=texture;entry.material.visible=true;entry.material.needsUpdate=true;
      entry.fallback.visible=false;entry.ready=true;old?.dispose();resolve();
    },undefined,()=>resolve());}catch{resolve();}
  });
  const loading=entry.loading;void loading.then(()=>{if(!entry.ready)entry.loading=undefined;});return loading;
}
function sphereFront(x:number,y:number,cx:number,cy:number,cz:number,rx:number,ry:number,rz:number) {
  const q=((x-cx)/rx)**2+((y-cy)/ry)**2;return q<1?cz-rz*Math.sqrt(1-q):Infinity;
}
/** Decals follow the actual projecting eyes and nose, not the flat surface behind them. */
export function refinedFaceSurface(x:number,y:number,id:RefinedFace) {
  let z=headSurface(x,y,id);
  if(id==='shaggy')z=Math.min(z,sphereFront(x,y,0,-.044,headSurface(0,-.042,id)-.017,.014,.023,.030));
  else if(id==='light')z=Math.min(z,sphereFront(x,y,0,-.036,headSurface(0,-.036,id)-.004,.008,.018,.011));
  else if(id==='sasuke'||id==='onizuka') {
    const cy=-.034;
    z=Math.min(z,sphereFront(x,y,0,cy,headSurface(0,cy,id)-.005,.010,.020,id==='onizuka'?.016:.013));
  }
  return z;
}
export function createRefinedFaceArtwork(id:RefinedFace) {
  const d=REFINED_FACE_ARTWORK[id],columns=28,rows=28,positions:number[]=[],uv:number[]=[],indices:number[]=[];
  const atY=(v:number)=>v<d.eyeV?THREE.MathUtils.lerp(d.top,d.eyeY,v/d.eyeV)
    :v<d.mouthV?THREE.MathUtils.lerp(d.eyeY,d.mouthY,(v-d.eyeV)/(d.mouthV-d.eyeV))
    :THREE.MathUtils.lerp(d.mouthY,d.top-d.height,(v-d.mouthV)/(1-d.mouthV));
  for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++) {
    const u=column/columns,v=row/rows,y=atY(v),half=headHalfWidth(y,id)*.985;
    const x=THREE.MathUtils.clamp((u-.5)*d.width,-half,half);
    positions.push(x,y,refinedFaceSurface(x,y,id)-.0035);uv.push(u,1-v);
    if(row<rows&&column<columns){const a=row*(columns+1)+column,b=a+1,c=a+columns+1;indices.push(a,b,c,b,c+1,c);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,refinedFaceMaterial(id));mesh.name=`face-artwork-${id}`;mesh.userData.faceArtwork=id;mesh.renderOrder=1;return mesh;
}
