import { readGameValue } from './storage.ts';
import * as THREE from 'three';

export const BOARD_STYLES=[
  {id:'classic',name:'Workshop',description:'Maple grain, burnt orange and cream wheels',deck:0xd5ab73,accent:0xee693c,ink:0x23343a,wheels:0xf1e7cc},
  {id:'neon',name:'Night Circuit',description:'Electric mint and violet on a dark deck',deck:0x231b46,accent:0x63f0ce,ink:0xa276eb,wheels:0x9e7ae7},
  {id:'sakura',name:'Sakura',description:'Cherry blossoms on a warm ivory deck',deck:0xf6e6d5,accent:0xdb7097,ink:0x654263,wheels:0xe79cba},
  {id:'dragon',name:'Dragon Spirit',description:'Orange sunburst, blue energy rings and blue wheels',deck:0xf2792d,accent:0x254b9a,ink:0xffe3a0,wheels:0x3c66b4},
  {id:'shinobi',name:'Shinobi',description:'Orange and charcoal with a spiral crest',deck:0x202c37,accent:0xf39a3d,ink:0xc74e43,wheels:0xed9c48},
  {id:'stunt',name:'Stunt Team',description:'Red racing stripes, stars and golden wheels',deck:0xf4f0df,accent:0xdc3c36,ink:0x26333b,wheels:0xf1c448},
  {id:'alpine',name:'Alpine',description:'Layered mountains, glacier blue and a warm sun',deck:0xcbe5e8,accent:0x287d95,ink:0xf3ae61,wheels:0xe8f1e2},
  {id:'midnight',name:'Midnight',description:'Bone-white geometry on charcoal with red wheels',deck:0x20252c,accent:0xe5dcc5,ink:0xb94e50,wheels:0xc96b67},
  {id:'nimbus',name:'Nimbus',description:'The golden flying cloud from Dragon Ball, in place of the deck and wheels',deck:0x8fd3f4,accent:0xf5b21f,ink:0xe0782a,wheels:0xffd34d},
] as const;
export type BoardStyleId=(typeof BOARD_STYLES)[number]['id'];
export const BOARD_STYLE_STORAGE_KEY='skate20XX.boardStyle';
type StorageLike=Pick<Storage,'getItem'|'setItem'>;
export function isBoardStyleId(value:unknown):value is BoardStyleId{return BOARD_STYLES.some(style=>style.id===value);}
export function loadBoardStyle(storage?:StorageLike):BoardStyleId {
  try{const value=readGameValue(storage ?? globalThis.localStorage, BOARD_STYLE_STORAGE_KEY);return isBoardStyleId(value)?value:'classic';}catch{return 'classic';}
}
export function saveBoardStyle(style:BoardStyleId,storage?:StorageLike) {
  try{(storage??globalThis.localStorage).setItem(BOARD_STYLE_STORAGE_KEY,style);}catch{/* Storage can be disabled. */}
}
export function boardStyle(id:BoardStyleId){return BOARD_STYLES.find(style=>style.id===id)!;}
export type BoardSurface='graphic'|'grip'|'edge'|'wheel'|'accent'|'binding';

const textures=new Map<string,THREE.DataTexture>();
/** Small, deterministic raster graphics: two cached 128 x 512 maps per design, shared by both modes. */
export function boardTexture(id:BoardStyleId,grip=false):THREE.DataTexture {
  const key=id+(grip?':grip':':graphic'),cached=textures.get(key);if(cached)return cached;
  const p=boardStyle(id),w=128,h=512,data=new Uint8Array(w*h*4);
  const pixel=(x:number,y:number,color:number)=>{if(x<0||x>=w||y<0||y>=h)return;const at=(Math.floor(y)*w+Math.floor(x))*4;data[at]=color>>16;data[at+1]=(color>>8)&255;data[at+2]=color&255;data[at+3]=255;};
  const fill=(color:number)=>{for(let y=0;y<h;y++)for(let x=0;x<w;x++)pixel(x,y,color);};
  const polygon=(points:number[][],color:number)=>{
    const ps=points.map(([x,y])=>[x!*w,y!*h]);
    for(let y=Math.max(0,Math.floor(Math.min(...ps.map(p=>p[1]!))));y<Math.min(h,Math.ceil(Math.max(...ps.map(p=>p[1]!))));y++) {
      const xs:number[]=[];
      for(let i=0,j=ps.length-1;i<ps.length;j=i++) {
        const a=ps[i]!,b=ps[j]!;
        if((a[1]!>y)!==(b[1]!>y))xs.push(a[0]!+(y-a[1]!)*(b[0]!-a[0]!)/(b[1]!-a[1]!));
      }
      xs.sort((a,b)=>a-b);for(let i=0;i<xs.length;i+=2)for(let x=Math.max(0,Math.ceil(xs[i]!));x<Math.min(w,xs[i+1]!);x++)pixel(x,y,color);
    }
  };
  const rect=(x:number,y:number,width:number,height:number,color:number)=>polygon([[x,y],[x+width,y],[x+width,y+height],[x,y+height]],color);
  const disk=(x:number,y:number,r:number,color:number,inner=0)=>{
    const cx=x*w,cy=y*h,rad=r*w;
    for(let yy=Math.max(0,Math.floor(cy-rad));yy<Math.min(h,cy+rad);yy++)for(let xx=Math.max(0,Math.floor(cx-rad));xx<Math.min(w,cx+rad);xx++) {
      const d=Math.hypot(xx-cx,yy-cy);if(d<=rad&&d>=inner*w)pixel(xx,yy,color);
    }
  };
  const line=(x:number,y:number,xx:number,yy:number,width:number,color:number)=>{
    const dx=xx-x,dy=(yy-y)*h/w,length=Math.hypot(dx,dy),nx=-dy/length*width/2,ny=dx/length*width/2*w/h;
    polygon([[x+nx,y+ny],[xx+nx,yy+ny],[xx-nx,yy-ny],[x-nx,y-ny]],color);
  };
  const star=(x:number,y:number,r:number,color:number)=>polygon(Array.from({length:10},(_,i)=>{
    const angle=i*Math.PI/5-Math.PI/2,rad=r*(i%2?0.43:1);return [x+Math.cos(angle)*rad,y+Math.sin(angle)*rad*w/h];
  }),color);
  fill(grip?0x20272b:p.deck);
  if(grip) {
    // Fine, fixed grain plus large end marks that remain visible around the rider's feet.
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const n=((x*374761393+y*668265263)^(x*y*31))>>>0;if(n%11<3)pixel(x,y,n%2?0x30373a:0x171e22);}
    for(const y of [0.08,0.88])polygon([[0.16,y],[0.5,y+0.045],[0.84,y],[0.84,y+0.025],[0.5,y+0.07],[0.16,y+0.025]],p.accent);
    rect(0.47,0.18,0.06,0.64,p.accent);rect(0.485,0.2,0.03,0.6,0x20272b);
    for(const y of [0.29,0.68])for(const x of [0.34,0.66])disk(x,y,0.013,0xd5d8d0);
  } else {
    if(id==='classic') {
      for(let x=2;x<w;x+=6)for(let y=0;y<h;y++)pixel(x+Math.round(Math.sin(y*.035+x)*1.8),y,0xbd8d5e);
      polygon([[0,0.24],[1,0.15],[1,0.6],[0,0.69]],p.accent);
      polygon([[0,0.28],[1,0.19],[1,0.22],[0,0.31]],p.ink);
      disk(0.5,0.43,0.3,p.ink);star(0.5,0.43,0.2,0xf9e8c3);
    }
    if(id==='neon') {
      for(let y=0.1;y<0.95;y+=0.11)polygon([[0,y],[0.58,y+0.025],[1,y-0.035],[1,y+0.018],[0.6,y+0.075],[0,y+0.05]],Math.round(y*10)%2?p.accent:p.ink);
      polygon([[0.57,0.28],[0.22,0.53],[0.48,0.51],[0.31,0.71],[0.83,0.43],[0.57,0.45]],0xf8e3be);
    }
    if(id==='sakura') {
      line(0.21,0.92,0.67,0.18,0.055,p.ink);line(0.44,0.57,0.89,0.4,0.026,p.ink);line(0.57,0.35,0.2,0.24,0.025,p.ink);
      for(const [x,y] of [[0.66,0.2],[0.25,0.25],[0.82,0.4],[0.4,0.55],[0.25,0.78]]) {
        for(let i=0;i<5;i++){const angle=i*Math.PI*2/5;disk(x!+Math.cos(angle)*.075,y!+Math.sin(angle)*.019,.062,p.accent);}
        disk(x!,y!,0.027,0xf4b562);
      }
      for(let i=0;i<10;i++)disk(0.15+(i*0.213)%0.7,0.12+(i*0.137)%0.77,0.015,p.accent);
    }
    if(id==='dragon') {
      for(let i=0;i<12;i++){const angle=i*Math.PI/6;line(.5,.5,.5+Math.cos(angle),.5+Math.sin(angle)*.5,.06,p.ink);}
      for(const r of [.37,.28,.19])disk(.5,.49,r,p.accent,r-.035);
      polygon([[.54,.25],[.22,.5],[.48,.49],[.35,.71],[.79,.44],[.57,.45]],p.accent);
      for(const y of [.15,.82]){disk(.5,y,.16,p.ink);star(.5,y,.085,p.accent);}
    }
    if(id==='shinobi') {
      rect(.08,0,.11,1,p.accent);rect(.81,0,.11,1,p.accent);
      polygon([[0,.73],[1,.56],[1,.84],[0,1]],p.accent);
      for(let i=0;i<5;i++)disk(.5,.38,.35-i*.065,i%2?p.deck:p.ink);
      line(.5,.38,.82,.29,.045,p.ink);line(.82,.29,.87,.22,.045,p.ink);
      for(let i=0;i<4;i++)line(.27,.14+i*.022,.73,.14+i*.022,.015,0xb7c6cc);
    }
    if(id==='stunt') {
      rect(.36,0,.28,1,p.accent);rect(.39,0,.04,1,0xf7edda);rect(.57,0,.04,1,0xf7edda);
      for(const y of [.26,.48,.7]){disk(.5,y,.24,p.deck);star(.5,y,.18,p.ink);}
      for(let i=0;i<8;i++)for(let j=0;j<2;j++)rect(i/8,.11+j*.03125,.125,.03125,(i+j)%2?p.ink:p.deck);
    }
    if(id==='alpine') {
      disk(.72,.24,.19,p.ink);
      for(const [y,color] of [[.43,0x6ba8b5],[.59,p.accent],[.78,0x21485e]])polygon([[0,y as number],[.26,(y as number)-.13],[.45,(y as number)-.035],[.72,(y as number)-.17],[1,y as number],[1,1],[0,1]],color as number);
      polygon([[.14,.37],[.26,.3],[.36,.35],[.28,.34],[.25,.36],[.21,.35]],0xf1f3df);
      for(const y of [.82,.86,.9])line(.2,y,.8,y-.025,.012,p.deck);
    }
    if(id==='midnight') {
      for(const y of [.23,.47,.71]) {
        polygon([[.5,y-.11],[.88,y],[.5,y+.11],[.12,y]],p.accent);
        polygon([[.5,y-.077],[.76,y],[.5,y+.077],[.24,y]],p.deck);
        disk(.5,y,.05,p.ink);
      }
      rect(.1,0,.025,1,p.ink);rect(.875,0,.025,1,p.ink);
    }
    if(id==='nimbus') {
      // Hidden by the cloud itself, but every design keeps its own graphic: golden puffs on sky blue.
      for(const [x,y,r] of [[.3,.2,.16],[.55,.24,.2],[.75,.19,.13],[.4,.62,.18],[.65,.66,.15],[.25,.68,.12]] as const){disk(x,y+.02,r,p.ink);disk(x,y,r,p.accent);}
    }
    // Small maker bars unify the collection without depending on fonts or image downloads.
    rect(.3,.93,.4,.008,p.ink);for(let i=0;i<5;i++)rect(.34+i*.065,.948,.032,.008,p.accent);
  }
  const texture=new THREE.DataTexture(data,w,h,THREE.RGBAFormat);texture.colorSpace=THREE.SRGBColorSpace;
  texture.flipY=true;texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  texture.anisotropy=4;texture.name=`board-${key}`;texture.needsUpdate=true;textures.set(key,texture);return texture;
}
export function boardMaterial(surface:BoardSurface) {
  const material=new THREE.MeshStandardMaterial({roughness:surface==='grip'?0.98:0.62});material.userData.boardSurface=surface;
  return material;
}
/** UVs follow board length, so the same graphics fit either outline and its raised tips. */
export function boardUVs(geometry:THREE.BufferGeometry,halfWidth:number,halfLength:number) {
  const positions=geometry.getAttribute('position'),uv=new Float32Array(positions.count*2);
  for(let i=0;i<positions.count;i++){uv[i*2]=(positions.getX(i)/halfWidth+1)/2;uv[i*2+1]=(positions.getZ(i)/halfLength+1)/2;}
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));return geometry;
}
/** Materials stay in place so board fragments in an active crash update too. */
export function applyBoardStyle(root:THREE.Object3D,id:BoardStyleId) {
  const palette=boardStyle(id);
  root.traverse(object=>{
    // Shaped designs replace the deck, trucks and wheels; everything else keeps the board hardware.
    const shape=object.userData.boardShape as string|undefined;if(shape)object.visible=(shape==='hardware')===(id!=='nimbus');
    if(!(object instanceof THREE.Mesh))return;
    for(const source of Array.isArray(object.material)?object.material:[object.material]) {
      const mat=source as THREE.MeshStandardMaterial,surface=mat.userData.boardSurface as BoardSurface|undefined;
      if(!surface || mat.userData.boardStyle===id)continue;
      mat.color.setHex(surface==='graphic'||surface==='grip'?0xffffff:surface==='edge'?palette.deck:surface==='wheel'?palette.wheels:surface==='accent'?palette.accent:palette.ink);
      if(surface==='graphic'||surface==='grip'){const first=!mat.map;mat.map=boardTexture(id,surface==='grip');if(first)mat.needsUpdate=true;}
      mat.userData.boardStyle=id;
    }
  });
}
