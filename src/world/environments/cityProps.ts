import * as THREE from 'three';
import {surface,facadeMaterial} from '../appearance.ts';
import {sceneryMaterial,markAsset} from '../variety.ts';

const shared=<T extends THREE.BufferGeometry>(geometry:T)=>{geometry.userData.shared=true;return geometry;};
const cube=shared(new THREE.BoxGeometry()),plane=shared(new THREE.PlaneGeometry()),cylinder=shared(new THREE.CylinderGeometry(0.5,0.5,1,8));
const material=(color:number,metalness=0)=>sceneryMaterial(color,metalness,0.82);
const walls=[0xb87055,0xd8c6a4,0x81949c,0x687985].map(color=>material(color));
const trim=material(0xe5e0d2),dark=material(0x263e49),glass=material(0x477789,0.25),litGlass=facadeMaterial(material(0xe4c58b));
const teal=material(0x288d8b),red=material(0xdb6546),concrete=material(0x969e9d),steel=material(0x53636e,0.45);
const pick=<T>(values:readonly T[],rng:()=>number)=>values[Math.floor(rng()*values.length)]!;

function group(kind:string) {
  const root=new THREE.Group();root.name=`city-${kind}`;root.userData.cityKind=kind;root.userData.placement='pad';return markAsset(root,`city-${kind}`);
}
function part(root:THREE.Object3D,geometry:THREE.BufferGeometry,mat:THREE.Material,size:number[],at:number[],decoration=false) {
  const mesh=new THREE.Mesh(geometry,mat);mesh.scale.set(size[0]!,size[1]!,size[2]!);mesh.position.set(at[0]!,at[1]!,at[2]!);
  if(decoration)mesh.userData.collision=false;
  root.add(mesh);return mesh;
}
const box=(root:THREE.Object3D,mat:THREE.Material,size:number[],at:number[],decoration=false)=>part(root,cube,mat,size,at,decoration);

let signs:{material:THREE.Material;geometry:THREE.BufferGeometry[]} | undefined;
function shopSign(root:THREE.Object3D,choice:number,width:number,y:number,z:number) {
  if(!signs) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
    const context=canvas.getContext('2d')!;
    context.fillStyle='#203e49';context.fillRect(0,0,512,512);
    context.fillStyle='#fff0c9';context.font='bold 26px sans-serif';context.textAlign='center';context.textBaseline='middle';
    ['COFFEE CLUB','BOARD SHOP','CORNER MARKET','METRO RECORDS','NOODLE HOUSE','LOCAL BAKERY','ART SUPPLY','CYCLE WORKS',
      'CITY BOOKS','FLOWER SHOP','VINYL & TAPES','HARDWARE','NIGHT OWL DELI','STREETWEAR','PHOTO LAB','THE ARCADE']
      .forEach((name,i)=>context.fillText(name,(i%2)*256+128,Math.floor(i/2)*64+32));
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    signs={material:facadeMaterial(surface(new THREE.MeshStandardMaterial({map:texture,roughness:0.9}),'scenery')),geometry:[]};
    for(let cell=0;cell<16;cell++) {
      const geometry=shared(new THREE.PlaneGeometry()),uv=geometry.getAttribute('uv');
      for(let i=0;i<uv.count;i++){uv.setX(i,(uv.getX(i)+cell%2)/2);uv.setY(i,(uv.getY(i)+7-Math.floor(cell/2))/8);}
      signs.geometry.push(geometry);
    }
  }
  part(root,signs.geometry[choice%16]!,signs.material,[width,0.75,1],[0,y,z],true);
}

export type CityBuildingStyle='apartment'|'office'|'shop'|'tower';

/** Flat facade panels share geometry/materials; the solid shell supplies inexpensive collision. */
export function makeCityBuilding(rng:()=>number,style:CityBuildingStyle='apartment') {
  const root=group(style==='tower'?'tower':'building');
  const tower=style==='tower',office=style==='office' || tower,shop=style==='shop';
  const width=(tower?11:8)+rng()*(tower?4:2),depth=(tower?10:7.5)+rng()*3;
  const floors=(tower?8:office?4:shop?1:2)+Math.floor(rng()*(tower?5:office?3:shop?2:4));
  const ground=3.4,height=ground+floors*3.05,wall=pick(walls,rng),accent=rng()<0.5?teal:red;
  const massing=Math.floor(width*1000)%4,setback=massing>=2 && floors>=4;
  const shoulder=ground+Math.ceil(floors*0.6)*3.05;
  const roofWidth=setback?width*(massing===2?0.78:0.64):width,roofDepth=setback?depth*0.76:depth;
  const roofX=setback && massing===3?width*0.12:0,roofZ=setback && massing===3?-depth*0.08:0;
  root.userData.massing=setback?(massing===2?'setback':'offset-tower'):'straight';
  root.userData.frontage=style!=='tower';root.userData.width=width;root.userData.depth=depth;
  box(root,concrete,[width+0.4,0.24,depth+0.4],[0,0.12,0]);
  if(setback) {
    box(root,wall,[width,shoulder,depth],[0,shoulder/2+0.24,0]);
    box(root,wall,[roofWidth,height-shoulder,roofDepth],[roofX,(height+shoulder)/2+0.24,roofZ]);
    box(root,trim,[width+0.4,0.18,depth+0.4],[0,shoulder+0.24,0]);
  } else box(root,wall,[width,height,depth],[0,height/2+0.24,0]);
  box(root,trim,[roofWidth+0.5,0.24,roofDepth+0.5],[roofX,height+0.24,roofZ]);
  // Roof parapets and rooftop plant create a varied silhouette without lights or moving objects.
  for(const side of [-1,1]) {
    box(root,trim,[roofWidth+0.5,0.48,0.18],[roofX,height+0.57,roofZ+side*(roofDepth/2+0.1)]);
    box(root,trim,[0.18,0.48,roofDepth+0.5],[roofX+side*(roofWidth/2+0.1),height+0.57,roofZ]);
  }
  box(root,steel,[roofWidth*0.26,0.95,roofDepth*0.25],[roofX-roofWidth*0.2,height+0.84,roofZ-roofDepth*0.17]);
  if(tower)box(root,wall,[roofWidth*0.55,2.6,roofDepth*0.5],[roofX+roofWidth*0.12,height+1.65,roofZ]);
  for(let floor=0;floor<floors;floor++) {
    const y=ground+1.6+floor*3.05;
    const upper=setback && y>shoulder,w=upper?roofWidth:width,d=upper?roofDepth:depth,cx=upper?roofX:0,cz=upper?roofZ:0;
    if(floor%2===0)box(root,trim,[w+0.08,0.12,d+0.08],[cx,y-1.15,cz],true).userData.variantPart='floor-band';
    for(let face=0;face<4;face++) {
      const span=face%2?d:w,out=(face%2?w:d)/2+0.045,columns=Math.floor(span/(office?2.4:2.8));
      for(let col=0;col<columns;col++) {
        const offset=(col-(columns-1)/2)*(span/(columns+0.6));
        const mesh=part(root,plane,rng()<0.15?litGlass:glass,[office?1.7:1.3,1.65,1],[0,y,0],true);
        mesh.userData.variantPart='window';mesh.userData.windowRow=floor;
        mesh.rotation.y=face*Math.PI/2;
        const point=new THREE.Vector3(offset,0,out).applyAxisAngle(new THREE.Vector3(0,1,0),mesh.rotation.y);
        mesh.position.x=cx+point.x;mesh.position.z=cz+point.z;
      }
    }
  }
  // Ground-floor doors and glazing face the road (+Z before placement).
  for(const side of [-1,1])part(root,plane,glass,[width*0.33,2.15,1],[side*width*0.29,1.55,depth/2+0.045],true);
  box(root,dark,[1.45,2.45,0.12],[0,1.47,depth/2+0.05],true);
  part(root,plane,glass,[1.04,1.85,1],[0,1.55,depth/2+0.12],true);
  box(root,trim,[0.07,2.15,0.06],[0,1.55,depth/2+0.16],true);
  if(!tower) {
    box(root,accent,[width+0.25,0.17,1.15],[0,3.1,depth/2+0.45]).userData.variantPart='awning';
    box(root,accent,[width*0.86,0.95,0.13],[0,3.85,depth/2+0.08],true);
    shopSign(root,Math.floor(rng()*16),width*0.79,3.85,depth/2+0.155);
    for(const side of [-1,1])box(root,trim,[0.2,2.9,0.2],[side*(width/2-0.15),1.65,depth/2+0.05],true);
  }
  return root;
}

export function makeCityHydrant() {
  const root=group('hydrant');
  part(root,cylinder,red,[0.36,0.78,0.36],[0,0.44,0]);
  part(root,cylinder,steel,[0.52,0.12,0.52],[0,0.08,0]);
  part(root,cylinder,red,[0.48,0.12,0.48],[0,0.9,0]);
  box(root,red,[0.7,0.22,0.25],[0,0.6,0]);
  return root;
}

export function makeCityBin() {
  const root=group('bin');
  box(root,teal,[0.65,0.95,0.65],[0,0.5,0]);
  box(root,steel,[0.73,0.14,0.73],[0,1.04,0]);
  part(root,plane,dark,[0.38,0.18,1],[0,0.84,0.331],true);
  return root;
}

export function makeParkingMeter() {
  const root=group('parking-meter');
  part(root,cylinder,steel,[0.09,1.25,0.09],[0,0.625,0]);
  box(root,teal,[0.33,0.5,0.24],[0,1.5,0]);
  part(root,plane,dark,[0.21,0.15,1],[0,1.59,0.126],true);
  return root;
}
