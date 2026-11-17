import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {characterHandGeometry} from '../geometry.ts';
import {batchCosmetics} from '../cosmetics.ts';
import {cosmeticMesh as mesh,cosmeticOval as oval,cosmeticLine as line} from '../primitives.ts';
import type {CharacterModel} from '../registry.ts';

const WOOD=0xa76d36,DARK_WOOD=0x68401e,INK=0x302014,IVORY=0xe9dfc9;
const cache=new Map<string,THREE.BufferGeometry>();

/** Precomputed grain follows the length of the wood; no image downloads or animation-time work. */
function grain(geometry:THREE.BufferGeometry,yOffset=0) {
  const p=geometry.getAttribute('position'),colors=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),y=p.getY(i)+yOffset,z=p.getZ(i),a=Math.atan2(x,z);
    const warp=.55*Math.sin(y*9+a*3)+.22*Math.sin(y*21-a*5);
    const fine=Math.pow(.5+.5*Math.sin(a*43+warp*2),7);
    const value=.93+.105*Math.sin(a*19+warp)+.045*Math.sin(a*31-warp)-.13*fine;
    colors[i*3]=value;colors[i*3+1]=value*.985;colors[i*3+2]=value*.96;
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));return geometry;
}
function cached(key:string,create:()=>THREE.BufferGeometry) {
  let geometry=cache.get(key);if(!geometry){geometry=create();cache.set(key,geometry);}return geometry;
}
function lathe(profile:readonly(readonly[number,number])[],segments:number) {
  return new THREE.LatheGeometry(profile.map(([y,r])=>new THREE.Vector2(r,y)),segments);
}

/** The lower head overlaps the trunk. Matching round sections hide the neck through ordinary head motion. */
export function sahurHeadGeometry() {
  return grain(lathe([[-.108,.135],[-.080,.143],[-.025,.143],[.045,.143],[.115,.143],
    [.185,.143],[.240,.143],[.261,.140],[.274,.130],[.280,.108],[.282,.050],[.282,.001]],64),.515);
}
function trunkGeometry() {
  return cached('trunk',()=>{
    const g=grain(lathe([[-.270,.001],[-.270,.120],[-.250,.135],[-.205,.139],[-.170,.139],[-.125,.139],[-.075,.139],[-.025,.139],
      [.025,.139],[.075,.139],[.125,.139],[.175,.139],[.225,.139],[.265,.138]],48),.23);
    g.userData.characterOverride='chest';return g;
  });
}
function rodGeometry(kind:'upperarm'|'forearm'|'thigh'|'shin') {
  return cached(kind,()=>{
    const radius={upperarm:.036,forearm:.032,thigh:.062,shin:.044}[kind];
    const g=grain(lathe([[-.5,radius*.84],[-.40,radius*.96],[-.25,radius],[0,radius*.97],
      [.25,radius*.92],[.40,radius*.86],[.5,radius*.81]],16));
    g.userData.characterOverride=kind;return g;
  });
}
export const SAHUR_PARTS:NonNullable<CharacterModel['rigParts']>={
  chest:{geometry:trunkGeometry},
  upperarm:{geometry:()=>rodGeometry('upperarm')},forearm:{geometry:()=>rodGeometry('forearm')},
  thigh:{geometry:()=>rodGeometry('thigh')},shin:{geometry:()=>rodGeometry('shin')},
  hand:{geometry:hand=>cached(`hand-${hand.userData.handSide}`,()=>{
    const g=grain(characterHandGeometry(hand.userData.handSide,false).clone());g.userData.characterOverride='hand';return g;
  })},
  sleeve:{hidden:true},pelvis:{hidden:true},
};

function faceSurface(x:number){return -Math.sqrt(Math.max(.002,.143**2-x*x));}
function woodOval(parent:THREE.Group,color:number,center:readonly[number,number,number],size:readonly[number,number,number]) {
  const geometry=new THREE.SphereGeometry(1,12,8);geometry.scale(...size);geometry.translate(...center);
  return mesh(parent,grain(geometry,.515),color);
}
function faceLine(parent:THREE.Group,color:number,points:readonly(readonly[number,number])[],width=.0018,offset=.003) {
  return line(parent,color,points.map(([x,y])=>[x,y,faceSurface(x)-offset] as const),width);
}

export function addSahurHead(parent:THREE.Group) {
  parent.userData.modelName='Tung Tung Tung Sahur';
  for(const side of [-1,1]) {
    const x=side*.052,y=.105,z=faceSurface(x);
    // Hooded carved eyelids and larger dark irises give the original's wide, fixed stare.
    oval(parent,0x865526,[x,y,z-.001],[.043,.043,.019]);
    const eye=mesh(parent,new THREE.SphereGeometry(1,20,14),IVORY,x,y,z-.010);
    eye.scale.set(.0375,.0355,.027);eye.rotation.z=-side*.09;
    oval(parent,0x51351e,[x-side*.002,y-.001,z-.034],[.024,.027,.006]);
    oval(parent,0x17140f,[x-side*.002,y-.001,z-.039],[.0145,.0205,.003]);
    oval(parent,0xfff4d8,[x-side*.007,y+.009,z-.042],[.0035,.0045,.0015]);
    // These arcs sit on the eyeball volume, making the lids read as part of the wooden face.
    const lid=(upper:boolean)=>Array.from({length:7},(_,i)=>{
      const a=(upper?0:Math.PI)+i/6*Math.PI;
      const dx=Math.cos(a)*.037,dy=Math.sin(a)*(upper?.033:.031);
      return [x+dx,y+dy,z-.010-.027*Math.sqrt(Math.max(.05,1-(dx/.040)**2-(dy/.043)**2))] as const;
    });
    line(parent,WOOD,lid(true),.0040);line(parent,0xb77c40,lid(false),.0032);
    faceLine(parent,DARK_WOOD,[[side*.020,.157],[side*.039,.174],[side*.061,.173],[side*.082,.157]],.0038);
    faceLine(parent,0xb77d41,[[side*.024,.151],[side*.043,.162],[side*.063,.160]],.0014);
    woodOval(parent,WOOD,[side*.061,.011,faceSurface(side*.061)-.0005],[.025,.033,.008]);
    faceLine(parent,0x855025,[[side*.030,.028],[side*.049,.010],[side*.066,-.012]],.0010,.011);
  }
  woodOval(parent,WOOD,[0,.046,-.148],[.016,.039,.021]);
  woodOval(parent,0xb67c42,[0,.022,-.168],[.022,.016,.019]);
  for(const side of [-1,1]) {
    woodOval(parent,WOOD,[side*.015,.015,-.170],[.009,.008,.010]);
    oval(parent,DARK_WOOD,[side*.012,.012,-.182],[.0043,.0026,.0018]);
  }
  // Full carved lips and a subtly asymmetric smirk are characteristic of the reference face.
  faceLine(parent,0x875325,[[-.055,-.020],[-.026,-.026],[-.009,-.025],[.002,-.028],[.014,-.025],[.034,-.022],[.059,-.010]],.0038,.006);
  faceLine(parent,0xb77e44,[[-.052,-.024],[-.026,-.039],[.004,-.043],[.032,-.035],[.058,-.013]],.0045,.006);
  faceLine(parent,INK,[[-.056,-.021],[-.025,-.031],[0,-.034],[.032,-.026],[.059,-.012]],.0017,.014);
  for(const side of [-1,1])faceLine(parent,DARK_WOOD,[[side*.058,-.023],[side*.062,-.013]],.0012,.014);
  // End-grain rings on the top of the log remain visible from the chase camera during flips.
  const cap=new THREE.RingGeometry(0,.130,64,10);cap.rotateX(-Math.PI/2);
  const positions=cap.getAttribute('position'),endGrain=new Float32Array(positions.count*3);
  for(let i=0;i<positions.count;i++) {
    const radius=Math.hypot(positions.getX(i),positions.getZ(i));
    const value=.91+.10*Math.sin(radius*205+.16*Math.sin(Math.atan2(positions.getX(i),positions.getZ(i))*5));
    endGrain.set([value,value*.98,value*.95],i*3);
  }
  cap.setAttribute('color',new THREE.BufferAttribute(endGrain,3));
  mesh(parent,cap,0xb77d42,0,.28225,0);
}

/** A recessed connector keeps both leg roots joined to the tilting log, including strong sideways leans. */
export function addSahurHips(parent:THREE.Group) {
  const geometry=new THREE.CapsuleGeometry(.044,.15,4,8);geometry.rotateZ(Math.PI/2);geometry.translate(0,-.006,0);
  mesh(parent,grain(geometry),WOOD);
}

export function addSahurShoulders(parent:THREE.Group) {
  for(const side of [-1,1])woodOval(parent,WOOD,[side*.134,.36,0],[.034,.055,.040]);
}

export function addSahurFoot(parent:THREE.Group) {
  const parts:THREE.BufferGeometry[]=[];
  const shape=(g:THREE.BufferGeometry,x:number,y:number,z:number,sx=1,sy=1,sz=1)=>{
    g.scale(sx,sy,sz);g.translate(x,y,z);parts.push(g);
  };
  // Both modes retain the exact existing sole height; the toes extend out of the front of the bindings.
  shape(new THREE.SphereGeometry(1,16,10),0,.0205,-.017,.057,.039,.125);
  shape(new THREE.SphereGeometry(1,12,8),0,.065,.013,.046,.040,.065);
  for(const [i,x] of [-.045,-.023,0,.023,.044].entries()) {
    const length=.036-i*.0025;
    shape(new THREE.SphereGeometry(1,12,8),x,.011,-.112,.014,.0295,length);
  }
  const flat=parts.map(g=>g.index?g.toNonIndexed():g.clone()),geometry=grain(mergeGeometries(flat)!);
  parts.forEach(g=>g.dispose());flat.forEach(g=>g.dispose());
  mesh(parent,geometry,WOOD);
}

export function addSahurBat(hand:THREE.Mesh) {
  const bat=new THREE.Group();bat.name='character-bat-sahur';bat.userData.characterSkin='sahur';
  bat.userData.heldWeapon=true;
  bat.userData.characterAttachment=true;hand.add(bat);
  bat.position.set(-.022,.034,.007);bat.rotation.set(.10,0,Math.PI-.95);
  mesh(bat,grain(lathe([[-.042,.001],[-.040,.016],[-.030,.017],[-.020,.012],
    [.105,.012],[.165,.015],[.225,.023],[.305,.028],[.455,.029],[.525,.025],[.539,.015],[.543,.001]],24)),0xb67d40);
  for(const y of [.003,.028,.053,.078])mesh(bat,new THREE.CylinderGeometry(.0125,.0125,.005,12),0x8c5b2e,0,y,0);
  batchCosmetics(bat);
}
