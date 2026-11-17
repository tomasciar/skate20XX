import * as THREE from 'three';
import type {CharacterId} from '../catalog.ts';
import {headSurface,headHalfWidth} from '../geometry.ts';
import {REFINED_FACE_ARTWORK,isRefinedFace,refinedFaceMaterial,preloadRefinedFace,createRefinedFaceArtwork} from './refinedFaceArtwork.ts';
import type {RefinedFace} from './refinedFaceArtwork.ts';

type LegacyFace='goku'|'naruto'|'kick';
export type FaceCharacter=LegacyFace|RefinedFace;
export const FACE_ARTWORK={
  goku:{url:new URL('../../../assets/faces/goku.png',import.meta.url).href,width:0.176,height:0.175,top:0.070},
  naruto:{url:new URL('../../../assets/faces/naruto.png',import.meta.url).href,width:0.180,height:0.175,top:0.066},
  kick:{url:new URL('../../../assets/faces/kick.png',import.meta.url).href,width:0.207,height:0.170,top:0.063},
  ...REFINED_FACE_ARTWORK,
} as const;
export function hasFaceArtwork(id:CharacterId):id is FaceCharacter{return id==='goku'||id==='naruto'||id==='kick'||isRefinedFace(id);}

type FaceState={material:THREE.MeshBasicMaterial;ready:boolean;loading?:Promise<void>};
const cache=new Map<LegacyFace,FaceState>();
/** Recognizable fallback while the local artwork loads, or if images are unavailable offline. */
function fallbackTexture(id:LegacyFace) {
  const size=128,data=new Uint8Array(size*size*4),ink=0x121318,white=0xfffdf4;
  function polygon(points:number[][],color:number) {
    for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
      const u=(x+.5)/size,v=(y+.5)/size;let inside=false;
      for(let i=0,j=points.length-1;i<points.length;j=i++) {
        const a=points[i]!,b=points[j]!;
        if((a[1]!>v)!==(b[1]!>v)&&u<(b[0]!-a[0]!)*(v-a[1]!)/(b[1]!-a[1]!)+a[0]!)inside=!inside;
      }
      if(inside){const at=((size-1-y)*size+x)*4;data[at]=color>>16;data[at+1]=(color>>8)&255;data[at+2]=color&255;data[at+3]=255;}
    }
  }
  const ellipse=(x:number,y:number,rx:number,ry:number,color:number)=>polygon(Array.from({length:20},(_,i)=>[x+Math.cos(i/20*Math.PI*2)*rx,y+Math.sin(i/20*Math.PI*2)*ry]),color);
  const stroke=(points:number[][],width:number,color:number)=>{
    for(let i=1;i<points.length;i++) {
      const [x,y]=points[i-1]!,[xx,yy]=points[i]!,length=Math.hypot(xx!-x!,yy!-y!),nx=-(yy!-y!)/length*width/2,ny=(xx!-x!)/length*width/2;
      polygon([[x!+nx,y!+ny],[xx!+nx,yy!+ny],[xx!-nx,yy!-ny],[x!-nx,y!-ny]],color);
    }
  };
  if(id==='goku') {
    for(const right of [false,true]) {
      const mirror=(points:number[][])=>points.map(([x,y])=>[right?1-x!:x!,y!]);
      polygon(mirror([[.12,.315],[.44,.41],[.415,.485],[.17,.475]]),ink);
      polygon(mirror([[.145,.34],[.42,.417],[.397,.463],[.19,.455]]),white);
      ellipse(right?0.65:0.35,.414,.027,.034,ink);
      stroke(mirror([[.12,.27],[.43,.37]]),.029,ink);
    }
  } else if(id==='naruto') {
    for(const x of [.28,.72]) {ellipse(x,.405,.137,.065,ink);ellipse(x,.405,.122,.052,white);ellipse(x,.405,.045,.051,0x438bc6);ellipse(x,.405,.021,.034,ink);}
    stroke([[.15,.29],[.40,.335]],.018,0x936f32);stroke([[.6,.335],[.85,.29]],.018,0x936f32);
    for(let i=0;i<3;i++)for(const right of [false,true])stroke([[right?0.78:0.09,.54+i*.042],[right?0.91:0.22,.56+i*.042]],.011,ink);
  } else {
    for(const right of [false,true]) {
      const mirror=(points:number[][])=>points.map(([x,y])=>[right?1-x!:x!,y!]);
      polygon(mirror([[.12,.34],[.45,.42],[.40,.50],[.23,.51],[.15,.46]]),ink);
      polygon(mirror([[.145,.362],[.425,.43],[.388,.482],[.23,.49],[.17,.445]]),white);
      ellipse(right?0.65:0.35,.427,.022,.029,ink);
      stroke(mirror([[.12,.295],[.45,.385]]),.038,ink);
    }
  }
  if(id!=='kick')stroke([[.49,.53],[.475,.61],[.52,.615]],.009,ink);
  stroke(id==='kick'?[[.31,.78],[.57,.79],[.7,.73]]:[[.38,.76],[.49,.79],[.62,.755]],.012,ink);
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;
  texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.name=`face-fallback-${id}`;texture.needsUpdate=true;return texture;
}
export function faceMaterial(id:FaceCharacter) {
  if(isRefinedFace(id))return refinedFaceMaterial(id);
  let state=cache.get(id);
  if(!state) {
    const material=new THREE.MeshBasicMaterial({map:fallbackTexture(id),transparent:true,alphaTest:0.12,depthWrite:false,toneMapped:false});
    material.name=`face-artwork-${id}`;material.userData.faceArtwork=id;
    if(id!=='kick') {
      // Thicken only dark linework at display time. A fraction of a screen pixel keeps
      // eyebrows, mouths and Naruto's whiskers readable when the whole head is tiny.
      // The original illustration and bright eye interiors keep their colors and proportions.
      material.onBeforeCompile=shader=>{
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
          #ifdef USE_MAP
            vec4 faceSample = texture2D(map, vMapUv);
            vec2 inkStep = min(vec2(0.012), max(vec2(0.0018), fwidth(vMapUv) * 0.28));
            float inkCoverage = 0.0;
            for (int axis = 0; axis < 4; axis++) {
              vec2 direction = axis == 0 ? vec2(1.0,0.0) : axis == 1 ? vec2(-1.0,0.0) : axis == 2 ? vec2(0.0,1.0) : vec2(0.0,-1.0);
              vec4 neighbor = texture2D(map, vMapUv + direction * inkStep);
              float darkness = 1.0 - smoothstep(0.12, 0.28, max(neighbor.r,max(neighbor.g,neighbor.b)));
              inkCoverage = max(inkCoverage, neighbor.a * darkness * 0.94);
            }
            float extraInk = inkCoverage * (1.0 - faceSample.a);
            float alpha = faceSample.a + extraInk;
            faceSample.rgb = (faceSample.rgb * faceSample.a + vec3(0.008) * extraInk) / max(alpha,0.0001);
            faceSample.a = alpha;
            diffuseColor *= faceSample;
          #endif
        `);
      };
      material.customProgramCacheKey=()=> 'bold-anime-face-v1';
      material.userData.boldInk=true;
    }
    state={material,ready:false};cache.set(id,state);
  }
  return state.material;
}
/** Load only the selected face, cache it across mode changes/crashes, and limit its GPU size. */
export function preloadCharacterFace(id:CharacterId):Promise<void> {
  if(isRefinedFace(id))return preloadRefinedFace(id);
  if(!hasFaceArtwork(id))return Promise.resolve();
  faceMaterial(id);const state=cache.get(id)!;
  if(state.ready)return Promise.resolve();if(state.loading)return state.loading;
  state.loading=new Promise<void>(resolve=>{
    try {new THREE.TextureLoader().load(FACE_ARTWORK[id].url,texture=>{
      const image=texture.image as HTMLImageElement,maxEdge=512,scale=Math.min(1,maxEdge/Math.max(image.width,image.height));
      const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
      const context=canvas.getContext('2d');
      if(context){context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(image,0,0,canvas.width,canvas.height);(texture as THREE.Texture).image=canvas;}
      texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.name=`face-artwork-${id}`;texture.needsUpdate=true;
      const old=state.material.map;state.material.map=texture;state.material.needsUpdate=true;state.ready=true;old?.dispose();resolve();
    },undefined,()=>resolve());}catch{resolve();}
  });
  const loading=state.loading;
  void loading.then(()=>{if(!state.ready)state.loading=undefined;});
  return loading;
}

/** A curved UV face, rather than a flat sticker; the artwork follows cheeks, nose and chin. */
export function createFaceArtwork(id:FaceCharacter) {
  if(isRefinedFace(id))return createRefinedFaceArtwork(id);
  const definition=FACE_ARTWORK[id],columns=40,rows=44,positions:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++) {
    const u=column/columns,v=row/rows,y=definition.top-v*definition.height;
    const halfWidth=headHalfWidth(y,id)*.985,x=THREE.MathUtils.clamp((u-.5)*definition.width,-halfWidth,halfWidth);
    positions.push(x,y,headSurface(x,y,id)-.0025);uv.push(u,1-v);
    // Kick's design has no nose. Leave this region of the artwork unprojected so the
    // continuous skin surface shows through; retain the original eyes, cheeks and smirk.
    const nose=id==='kick'&&u>=.425&&u<.60&&v>=.51&&v<.68;
    if(row<rows&&column<columns&&!nose){const a=row*(columns+1)+column,b=a+1,c=a+columns+1;indices.push(a,b,c,b,c+1,c);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,faceMaterial(id));mesh.name=`face-artwork-${id}`;mesh.userData.faceArtwork=id;mesh.renderOrder=1;return mesh;
}
