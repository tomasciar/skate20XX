import * as THREE from 'three';
import {seededRandom} from '../planning/generation.ts';

type Finish='brick'|'concrete'|'stone'|'metal'|'glass'|'paving'|'setts';
const textures=new Map<Finish,THREE.Texture>();

/** One small repeating texture per finish, shared by every building and its winter variant. */
function textureFor(kind:Finish) {
  const cached=textures.get(kind);if(cached)return cached;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const g=canvas.getContext('2d')!,rng=seededRandom(3181+kind.length*79);
  if(typeof CanvasRenderingContext2D!=='undefined' && g instanceof CanvasRenderingContext2D) {
    g.fillStyle='#ededeb';g.fillRect(0,0,256,256);
    if(kind==='brick'||kind==='setts') {
      g.fillStyle='#9a9b94';g.fillRect(0,0,256,256);
      for(let row=0;row<8;row++)for(let col=-1;col<5;col++) {
        const shade=213+Math.floor(rng()*38),x=col*64+(row%2)*32;
        g.fillStyle=`rgb(${shade},${shade-3},${shade-8})`;g.fillRect(x+1.5,row*32+1.5,61,29);
        g.fillStyle='rgba(255,255,255,.16)';g.fillRect(x+2,row*32+2,60,1);
      }
    } else if(kind==='glass') {
      g.fillStyle='#b8c9ce';g.fillRect(0,0,256,256);
      for(let row=0;row<2;row++)for(let col=0;col<4;col++) {
        const x=col*64,y=row*128,warm=rng()<.23;
        g.fillStyle=warm?'#d9c6a0':'#5f777f';g.fillRect(x+3,y+3,58,121);
        g.fillStyle=warm?'#f1dfb2':'#9bb2b8';g.fillRect(x+5,y+5,54,40+rng()*34);
        g.fillStyle='rgba(24,39,46,.5)';g.fillRect(x+8,y+100,12,22);g.fillRect(x+35,y+91,15,31);
        g.fillStyle='rgba(238,245,241,.22)';for(let slat=0;slat<5;slat++)g.fillRect(x+5,y+8+slat*8,54,2);
        g.fillStyle='rgba(235,248,249,.23)';g.beginPath();g.moveTo(x+5,y+5);g.lineTo(x+30,y+5);g.lineTo(x+5,y+76);g.fill();
      }
    } else {
      const paving=kind==='paving'||kind==='stone',metal=kind==='metal',step=metal?16:paving?64:128;
      for(let y=0;y<256;y+=step)for(let x=0;x<256;x+=metal?256:step) {
        const shade=225+Math.floor(rng()*25);g.fillStyle=`rgb(${shade},${shade},${shade-2})`;
        g.fillRect(x+1,y+1,(metal?256:step)-2,step-2);
        g.fillStyle=metal?'rgba(25,39,45,.16)':'rgba(52,58,55,.22)';g.fillRect(x,y,metal?256:step,metal?2:1.5);
        if(!metal)g.fillRect(x,y,1.5,step);
      }
      if(metal)for(const x of [8,248])for(let y=16;y<256;y+=32){g.fillStyle='#a5abaa';g.fillRect(x,y,2,2);}
    }
    if(kind!=='glass')for(let i=0;i<1400;i++) {
      g.fillStyle=rng()<.5?'rgba(38,45,40,.045)':'rgba(255,255,255,.18)';g.fillRect(rng()*256,rng()*256,1+rng()*2,1+rng()*2);
    }
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;
  const size=kind==='setts'?[2.4,2]:kind==='brick'?[4,2]:kind==='glass'?[7,5.6]:[6,6];texture.repeat.set(1/size[0]!,1/size[1]!);
  textures.set(kind,texture);return texture;
}

export function architecturalFinish<T extends THREE.MeshStandardMaterial>(material:T,kind:Finish):T {
  material.userData.architectureFinish=kind;return material;
}
/** Lazy creation keeps browser canvas access out of module initialization. */
export function prepareArchitectureFinish(material:THREE.MeshStandardMaterial) {
  const kind=material.userData.architectureFinish as Finish|undefined;
  if(!kind || material.userData.preparedFinish===kind || typeof document==='undefined')return;
  material.map=textureFor(kind);material.userData.preparedFinish=kind;
}

/** Project metres before course warping/batching, so tiles keep their scale through origin shifts. */
export function writeArchitectureUV(geometry:THREE.BufferGeometry,matrix:THREE.Matrix4,alongOffset=0) {
  const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');if(!normals)return;
  const uv=new THREE.Float32BufferAttribute(new Float32Array(positions.count*2),2);
  const point=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix);
  for(let i=0;i<positions.count;i++) {
    point.fromBufferAttribute(positions,i).applyMatrix4(matrix);normal.fromBufferAttribute(normals,i).applyMatrix3(normalMatrix);
    const x=Math.abs(normal.x),y=Math.abs(normal.y),z=Math.abs(normal.z),top=y>=x && y>=z;
    uv.setXY(i,top?point.x:x>z?alongOffset-point.z:point.x,top?alongOffset-point.z:point.y);
  }
  geometry.setAttribute('uv',uv);
}
