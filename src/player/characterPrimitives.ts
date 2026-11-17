import * as THREE from 'three';
import {headSurface,surfacePatch} from './modelGeometry.ts';
import {isRefinedFace,nativeFaceDetails,finishNativeFaceDetails,createRefinedFaceArtwork} from './refinedFaceArtwork.ts';

export type Point2=readonly[number,number];
export type Point3=readonly[number,number,number];
export const colorMaterial=(color:number)=>new THREE.MeshStandardMaterial({color,roughness:.82});
export function cosmeticMesh(parent:THREE.Object3D,geometry:THREE.BufferGeometry,color:number,x=0,y=0,z=0) {
  const mesh=new THREE.Mesh(geometry,colorMaterial(color));mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}
export function cosmeticOval(parent:THREE.Object3D,color:number,center:Point3,size:Point3) {
  return cosmeticMesh(parent,new THREE.SphereGeometry(1,12,10),color,...center).scale.set(...size);
}
export function cosmeticLine(parent:THREE.Object3D,color:number,points:readonly Point3[],radius=.0018) {
  return cosmeticMesh(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),Math.max(8,points.length*3),radius,5,false),color);
}
export function projectedPatch(parent:THREE.Object3D,color:number,points:readonly Point2[],surface:(x:number,y:number)=>number,back=false,offset=.003,subdivisions=1) {
  return cosmeticMesh(parent,surfacePatch(points,surface,back,offset,subdivisions),color);
}
export function projectedLine(parent:THREE.Object3D,color:number,points:readonly Point2[],surface:(x:number,y:number)=>number,width=.002,back=false,offset=.004) {
  for(let i=1;i<points.length;i++) {
    const [ax,ay]=points[i-1]!,[bx,by]=points[i]!,length=Math.hypot(bx-ax,by-ay);
    const nx=-(by-ay)/length*width/2,ny=(bx-ax)/length*width/2;
    projectedPatch(parent,color,[[ax+nx,ay+ny],[bx+nx,by+ny],[bx-nx,by-ny],[ax-nx,ay-ny]],surface,back,offset,1);
  }
  for(const [x,y] of points.slice(1,-1))projectedPatch(parent,color,Array.from({length:8},(_,i)=>
    [x+Math.cos(i/8*Math.PI*2)*width/2,y+Math.sin(i/8*Math.PI*2)*width/2] as const),surface,back,offset,1);
}

/** Shared construction, with different eye shapes, brows, nose, mouth and jaw profiles per rider. */
export function addGuestFace(parent:THREE.Group,id:'sasuke'|'mj'|'onizuka',skin:number) {
  const details=isRefinedFace(id)?nativeFaceDetails(parent,id):parent;
  const surface=(x:number,y:number)=>headSurface(x,y,id),ink=0x28232a,white=0xf7f4ed;
  const patch=(color:number,p:readonly Point2[],offset=.003)=>projectedPatch(details,color,p,surface,false,offset);
  const stroke=(color:number,p:readonly Point2[],width=.002,offset=.004)=>projectedLine(details,color,p,surface,width,false,offset);
  const dot=(color:number,x:number,y:number,rx:number,ry:number,offset:number)=>patch(color,
    Array.from({length:12},(_,i)=>[x+Math.cos(i/12*Math.PI*2)*rx,y+Math.sin(i/12*Math.PI*2)*ry] as const),offset);
  for(const side of [-1,1]) {
    cosmeticOval(parent,skin,[side*(id==='onizuka'?.093:.085),-.014,.002],[.015,.025,.014]);
    const x=side*.033,y=-.013,eyewidth=id==='onizuka'?.022:id==='mj'?.019:.022,eyeheight=id==='onizuka'?.010:id==='mj'?.008:.012;
    const eye=(scale:number)=>[[-eyewidth,-.001],[-eyewidth*.65,eyeheight*.70],[eyewidth*.48,eyeheight],[eyewidth,-.001],[eyewidth*.40,-eyeheight*.6],[-eyewidth*.65,-eyeheight*.45]]
      .map(([dx,dy])=>[x+dx!*scale,y+dy!*scale] as const);
    patch(id==='mj'?0x3a2824:ink,eye(1),.002);patch(id==='mj'?0xe7e1d5:white,eye(.80),.003);
    dot(id==='sasuke'?0x464553:id==='mj'?0x3d2a21:0x76503a,x,y,.006,id==='mj'?.0055:.007,.004);dot(ink,x,y,.0035,id==='mj'?.005:.006,.0048);
    dot(white,x-.0018,y+.0025,.0014,.0014,.0055);
    const browY=id==='onizuka'?.013:id==='mj'?.020:.016;
    if(id==='mj') {
      stroke(0x292126,[[x-side*.018,browY-.002],[x-side*.006,browY+.006],[x+side*.008,browY+.007],[x+side*.021,browY+.001]],.0032);
      stroke(0x895f4c,[[x-side*.015,-.025],[x+side*.010,-.026],[x+side*.019,-.022]],.0008);
      // The cheekbone is sculpted into the head. Keep facial ink economical rather than drawing dark hollows.
      stroke(0xa7765c,[[side*.058,-.034],[side*.050,-.043]],.0008);
    } else stroke(ink,[[x-side*.021,browY-.005],[x,browY+.004],[x+side*.020,browY+.001]],id==='onizuka'?.006:.0045);
    if(id==='onizuka')stroke(0x986b50,[[side*.060,-.029],[side*.072,-.034]],.0016);
  }
  const noseY=id==='mj'?-.031:-.034;
  if(id!=='mj') {
    cosmeticOval(parent,skin,[0,noseY,surface(0,noseY)-.005],[.010,.020,id==='onizuka'?.016:.013]);
    stroke(0xa56d53,[[.003,-.047],[.012,-.049],[.015,-.044]],.0015);
  }
  if(id==='onizuka') {
    patch(ink,[[-.034,-.062],[-.013,-.064],[.014,-.061],[.036,-.055],[.026,-.075],[.004,-.081],[-.021,-.077]],.003);
    patch(white,[[-.029,-.063],[-.010,-.065],[.015,-.062],[.029,-.059],[.021,-.068],[-.020,-.070]],.0045);
    stroke(0xa56d53,[[-.035,-.062],[-.040,-.051]],.002);
  } else if(id==='mj') {
    stroke(0x704d3c,[[-.009,-.046],[-.006,-.049],[-.003,-.048]],.0010);
    stroke(0x704d3c,[[.009,-.046],[.006,-.049],[.003,-.048]],.0010);
    stroke(0xa57459,[[0,-.054],[0,-.060]],.0008);
    patch(0x794a43,[[-.022,-.070],[-.008,-.066],[0,-.069],[.008,-.066],[.022,-.070],[.011,-.077],[-.011,-.077]],.003);
    patch(0xa26a5d,[[-.020,-.073],[0,-.074],[.020,-.072],[.009,-.078],[-.009,-.078]],.0038);
    stroke(0x432c2a,[[-.021,-.071],[0,-.073],[.021,-.071]],.0014,.0048);
    stroke(0xa4755e,[[-.010,-.084],[.009,-.084]],.0007);
  } else stroke(ink,[[-.022,-.070],[0,-.072],[.023,-.069]],.0022);
  if(isRefinedFace(id)){finishNativeFaceDetails(details,id);parent.add(createRefinedFaceArtwork(id));}
}
