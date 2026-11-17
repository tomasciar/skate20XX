import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {croppedHairGeometry,headSurface,surfacePatch,sweptLockGeometry,torsoRadius,torsoCenter} from './modelGeometry.ts';
import {characterPalette} from '../characters.ts';
import {nativeFaceDetails,finishNativeFaceDetails,createRefinedFaceArtwork} from './refinedFaceArtwork.ts';

const SKIN=0xefc69e,HAIR=0x75452b,SHIRT=0xf7f6eb,INK=0x30271f;
const material=(color:number)=>new THREE.MeshStandardMaterial({color,roughness:.85});
function mesh(parent:THREE.Object3D,geometry:THREE.BufferGeometry,mat:THREE.Material,x=0,y=0,z=0) {
  const object=new THREE.Mesh(geometry,mat);object.position.set(x,y,z);parent.add(object);return object;
}
function oval(parent:THREE.Object3D,mat:THREE.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number) {
  mesh(parent,new THREE.SphereGeometry(1,16,12),mat,x,y,z).scale.set(sx,sy,sz);
}
function line(parent:THREE.Object3D,mat:THREE.Material,points:THREE.Vector3[],radius=.0018) {
  mesh(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),Math.max(8,points.length*4),radius,5,false),mat);
}

/** Eyes, round wire frames, a long nose and a cleft chin retain their silhouette in profile. */
export function addPeterHead(parent:THREE.Group) {
  const details=nativeFaceDetails(parent,'peter');
  const skin=material(characterPalette('peter','skate').skin),ink=material(INK),hair=material(HAIR),white=material(0xfffdf0);
  const stroke=(mat:THREE.Material,points:readonly(readonly[number,number])[],radius=.0018)=>
    line(details,mat,points.map(([x,y])=>new THREE.Vector3(x,y,headSurface(x,y,'peter')-.003)),radius);
  for(const side of [-1,1]) {
    oval(parent,skin,side*.108,-.016,.006,.020,.027,.019);
    line(parent,material(0xb78565),[new THREE.Vector3(side*.120,-.004,-.006),new THREE.Vector3(side*.123,-.015,-.010),new THREE.Vector3(side*.118,-.027,-.007)],.0015);
    const x=side*.037;
    const ellipse=(rx:number,ry:number,cx=x,cy=.007)=>Array.from({length:24},(_,i)=>[cx+Math.cos(i/24*Math.PI*2)*rx,cy+Math.sin(i/24*Math.PI*2)*ry] as const);
    mesh(details,surfacePatch(ellipse(.028,.028),(xx,yy)=>headSurface(xx,yy,'peter'),false,.004,1),white);
    mesh(details,surfacePatch(ellipse(.0043,.0065,x-side*.003,.003),(xx,yy)=>headSurface(xx,yy,'peter'),false,.005,1),ink);
    mesh(details,new THREE.TorusGeometry(.031,.0023,6,32),ink,x,.007,-.114).scale.y=1.04;
    line(parent,ink,[new THREE.Vector3(side*.067,.017,-.112),new THREE.Vector3(side*.102,.014,-.072),new THREE.Vector3(side*.119,-.003,.002)],.0020);
    stroke(hair,[[side*.017,.048],[side*.037,.054],[side*.058,.049]],.0027);
  }
  line(details,ink,[new THREE.Vector3(-.007,.013,-.114),new THREE.Vector3(0,.018,-.117),new THREE.Vector3(.007,.013,-.114)],.0021);
  stroke(ink,[[-.039,-.070],[-.016,-.077],[.010,-.078],[.038,-.068]],.002);
  stroke(ink,[[-.020,-.087],[-.004,-.091],[.012,-.090],[.023,-.085]],.0017);
  // The two lower lobes blend into the jaw; only the short central cleft is outlined.
  stroke(ink,[[0,-.118],[-.001,-.128],[0,-.137]],.0017);
  mesh(parent,croppedHairGeometry('peter'),hair);
  mesh(parent,sweptLockGeometry([-.062,.092,-.053],[-.036,.069,-.085],[-.007,.076,-.086],.034,.013,6,8),hair);
  finishNativeFaceDetails(details,'peter');parent.add(createRefinedFaceArtwork('peter'));
  parent.scale.setScalar(1.20);
  skin.dispose();ink.dispose();hair.dispose();white.dispose();
}

/** All seams and buttons are fitted to the rounded shirt rather than the standard slim torso. */
export function addPeterOutfit(parent:THREE.Group,surface:(x:number,y:number)=>number,width:number,depth:number) {
  const shirt=material(SHIRT),seam=material(0xd5d8c9),ink=material(INK),gold=material(0xc6a14c);
  const patch=(mat:THREE.Material,points:readonly(readonly[number,number])[],offset=.004)=>
    mesh(parent,surfacePatch(points,surface,false,offset,2),mat);
  const stroke=(mat:THREE.Material,points:readonly(readonly[number,number])[],radius=.0015,offset=.004)=>
    line(parent,mat,points.map(([x,y])=>new THREE.Vector3(x,y,surface(x,y)-offset)),radius);
  patch(material(SKIN),[[-.053,.445],[.053,.445],[.026,.407],[0,.379],[-.025,.407]]);
  for(const side of [-1,1]) {
    patch(seam,[[side*.053,.441],[side*.102,.398],[side*.058,.352],[side*.012,.394]],.005);
    patch(shirt,[[side*.052,.435],[side*.093,.397],[side*.057,.361],[side*.019,.395]],.0065);
    stroke(seam,[[side*.188,.107],[side*.159,.129],[side*.126,.132]],.0013);
  }
  stroke(seam,[[0,.067],[0,.170],[0,.275],[0,.378]],.0015);
  for(const y of [.104,.178,.252,.326]) {
    oval(parent,ink,0,y,surface(0,y)-.006,.0045,.0045,.002);
    oval(parent,shirt,0,y,surface(0,y)-.008,.0023,.0023,.001);
  }
  stroke(seam,[[-.100,.291],[-.153,.295],[-.153,.258],[-.131,.250],[-.103,.257],[-.100,.291]],.0013);
  const belt=new THREE.LatheGeometry([.016,.044].map(y=>new THREE.Vector2(torsoRadius(y,'peter')+.005,y)),32);
  const p=belt.getAttribute('position');
  for(let i=0;i<p.count;i++) {
    p.setX(i,p.getX(i)*width);p.setZ(i,p.getZ(i)*depth+torsoCenter(p.getY(i),'peter')*depth);
  }
  belt.computeVertexNormals();mesh(parent,belt,ink);
  const buckleZ=surface(0,.031);
  mesh(parent,new RoundedBoxGeometry(.047,.031,.010,1,.003),gold,0,.031,buckleZ-.013);
  mesh(parent,new RoundedBoxGeometry(.031,.017,.003,1,.002),ink,0,.031,buckleZ-.018);
  mesh(parent,new THREE.BoxGeometry(.004,.019,.003),gold,.004,.031,buckleZ-.021);
  shirt.dispose();seam.dispose();ink.dispose();gold.dispose();
}

export function addPeterLimbDetails(parent:THREE.Group,kind:'upperarm'|'forearm'|'shin') {
  if(kind==='upperarm') {
    mesh(parent,new THREE.CylinderGeometry(.058,.057,.10,16,1,true),material(SHIRT),0,.06,0);
    mesh(parent,new THREE.CylinderGeometry(.0585,.0585,.018,16,1,true),material(0xd5d8c9),0,.103,0);
  } else if(kind==='shin') {
    mesh(parent,new THREE.CylinderGeometry(.052,.051,.08,12,1,true),material(0x2c633b),0,.44,0);
  }
}

export function addPeterShoeDetails(parent:THREE.Group) {
  mesh(parent,new RoundedBoxGeometry(.104,.028,.159,2,.009),material(0x70492f),0,.054,-.021);
  mesh(parent,new RoundedBoxGeometry(.060,.021,.009,1,.003),material(0x583923),0,.030,.084);
}
