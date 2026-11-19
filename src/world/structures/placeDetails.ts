import * as THREE from 'three';
import {CHUNK_LENGTH} from '../planning/generation.ts';
import {placePatches,placePatchLift} from '../planning/places.ts';
import type {PlaceSite} from '../planning/places.ts';
import {makeShopSign} from '../props/city.ts';
import {LANDMARK_MATERIALS as M,landmarkBox,sharedGeometry} from './parts.ts';

const pipeGeometry=sharedGeometry(new THREE.CylinderGeometry(1,1,1,8));
const shopColours=[0x397e7b,0xb9563e,0x597c9a,0xb28a42];

/** Architectural detail stays with its chunk and shares the solid structures' seven materials. */
export function* makePlaceDetails(index:number,site:PlaceSite) {
  const from=index*CHUNK_LENGTH,to=from+CHUNK_LENGTH,s=site.start,side=site.side;
  function* part(material:THREE.MeshStandardMaterial,x:number,width:number,a:number,b:number,y:number,height:number,name:string,solid=false,anchor?:number,tint?:number) {
    a=Math.max(a,from);b=Math.min(b,to);if(b<=a)return;
    const mesh=landmarkBox(material,[width,height,b-a],[x,y,-((a+b)/2-from)],!solid,true);
    mesh.name=name;if(anchor!==undefined)mesh.userData.levelBase=anchor;
    if(tint!==undefined)mesh.userData.sceneryTint=tint;yield mesh;
  }
  function* roofUnit(distance:number,along:number,height:number) {
    yield* part(M.steel,side*distance,3,along-2,along+2,height+.76,.6,'roof-vent-curb',true);
    yield* part(M.trim,side*distance,2.7,along-1.8,along+1.8,height+1.4,1,'roof-air-handler',true);
    for(const offset of [-.8,0,.8])yield* part(M.dark,side*(distance+offset),.28,along-1.4,along+1.4,height+1.93,.06,'roof-vent-grille');
    yield* part(M.steel,side*(distance+2.3),1.8,along-.5,along+.5,height+.61,.30,'roof-service-duct',true);
  }
  if(site.kind==='plaza') {
    const terrace=placePatches(site)[0]!;
    for(let along=s+50,slot=0;along<site.end-40;along+=30,slot++) {
      const colour=shopColours[(slot+site.seed)%shopColours.length]!;
      // Recessed-looking glazing, door leaves and projecting awnings turn the gallery into shops.
      yield* part(M.dark,side*116.18,.07,along-8,along+8,4.1,4.5,'plaza-shop-reveal');
      yield* part(M.glass,side*116.10,.045,along-7.6,along+4.3,4.15,3.8,'plaza-shop-window',false,undefined,0x648c86);
      yield* part(M.steel,side*116.04,.10,along+4.7,along+7.4,2.0,2.9,'plaza-shop-door');
      yield* part(M.glass,side*115.96,.035,along+5,along+7.1,2.2,2.1,'plaza-door-glass');
      for(const offset of [-3.8,.1,4.5])yield* part(M.trim,side*115.99,.15,along+offset-.07,along+offset+.07,4.1,4,'plaza-window-mullion');
      yield* part(M.paint,side*113.7,5.3,along-8.4,along+8.4,6.7,.20,'plaza-shop-awning',true,undefined,colour);
      yield* part(M.paint,side*110.98,.15,along-8.4,along+8.4,6.38,.5,'plaza-awning-valance',false,undefined,colour);
      yield* part(M.trim,side*116.02,.14,along-6,along+4,6.05,.9,'plaza-shop-sign-backing');
      if(along>=from && along<to) {
        const sign=makeShopSign((slot+site.seed)%16,9.3);sign.scale.y=.65;sign.position.set(side*115.86,6.05,-(along-1-from));
        sign.rotation.y=-side*Math.PI/2;sign.name='plaza-shop-sign';yield sign;
      }
      // Planted beds meet the existing tree bases. The low ledges leave the central banks open.
      yield* part(M.brick,side*98,4,along-3.5,along+3.5,5.04,.36,'plaza-tree-bed',true);
      yield* part(M.dark,side*98,3.5,along-3.2,along+3.2,5.23,.035,'plaza-planter-soil',false,undefined,0x65533b);
      for(const offset of [-3.45,3.45])yield* part(M.trim,side*98,4.2,along+offset-.15,along+offset+.15,5.16,.18,'plaza-planter-cap',true);
      if(slot%2===0) {
        const lift=placePatchLift(terrace,77,along);
        yield* part(M.steel,side*77,.18,along-.09,along+.09,.46+lift+2,4,'plaza-lamp',true,along);
        yield* part(M.steel,side*77,2,along-.25,along+.25,.46+lift+4,.16,'plaza-lamp-arm',true,along);
        yield* part(M.trim,side*77,1.7,along-.2,along+.2,.46+lift+3.9,.10,'plaza-lamp-diffuser',false,along,0xffe4a4);
      }
    }
    for(let along=s+54;along<site.end-45;along+=12)for(const [near,far,height] of [[58,67,1.2],[78,86,2.6],[98,102,4.4]])
      yield* part(M.steel,side*(near+far)/2,far-near,along,along+.06,.46+height+.026,.025,'plaza-paving-joint',false,undefined,0xa99f88);
    for(const along of [s+100,s+160]) {
      yield* part(M.brick,side*79,1.4,along-5,along+5,3.28,.44,'plaza-skate-ledge',true);
      yield* part(M.trim,side*79,1.5,along-5.1,along+5.1,3.52,.08,'plaza-ledge-cap',true);
    }
    for(let along=s+52;along<site.end-45;along+=15)
      yield* part(M.steel,side*109,18.3,along,along+.16,8.24,.25,'plaza-canopy-rib');
  } else if(site.kind==='highrise') {
    for(const [near,far,a,b] of [[26,56,70,180],[70,100,90,250]]) {
      for(let along=s+a+8;along<s+b-7;along+=12) {
        for(const [distance,width] of [[near+7,10],[far-5,8]])
          yield* part(M.trim,side*distance,width,along,along+.16,7.30,.035,'parking-stall-line');
      }
      // Short edge walls leave the roof crossing and both entry/exit banks unobstructed.
      const distance=near===26?near:far;
      for(let along=s+a+12;along<s+b-20;along+=38) {
        yield* part(M.concrete,side*distance,.48,along,along+16,7.6,.65,'parking-edge-wall',true);
        yield* part(M.trim,side*distance,.55,along-.1,along+16.1,7.96,.10,'parking-wall-cap');
      }
      for(const along of [s+a+14,s+b-14])for(const distance of [near+.35,far-.35]) {
        yield* part(M.brick,side*distance,.70,along-.35,along+.35,1.12,1.3,'parking-column-base',false,undefined,0xd5aa48);
        yield* part(M.steel,side*distance,.72,along-.36,along+.36,1.55,.12,'parking-column-band');
      }
    }
    yield* roofUnit(29,s+116,6.8);yield* roofUnit(96,s+205,6.8);
    // Crossing ribs stay below the bridge slab, retaining full ground clearance.
    for(let along=s+98;along<s+228;along+=20)
      yield* part(M.steel,side*63,14,along,along+.28,6.67,.22,'parking-bridge-crossbeam',true);
  } else {
    for(const [near,far,a,b] of [[26,56,70,180],[70,100,90,250]])for(const distance of [near,far]) {
      const outward=distance===near?-1:1,x=side*(distance+outward*.10);
      for(let along=s+a+13,bay=0;along<s+b-9;along+=25,bay++) {
        yield* part(M.dark,x,.08,along-4.4,along+4.4,2.05,3,'yard-loading-reveal');
        yield* part(M.steel,x+side*outward*.06,.05,along-3.9,along+3.9,2.05,2.8,'yard-roller-door',false,undefined,bay%2?0x7e8d85:0xa58e71);
        for(let row=0;row<5;row++)yield* part(M.dark,x+side*outward*.10,.035,along-3.85,along+3.85,.95+row*.5,.055,'yard-door-rib');
        for(const offset of [-4.3,4.3])yield* part(M.trim,x,.25,along+offset-.12,along+offset+.12,2.1,3.2,'yard-door-jamb');
        yield* part(M.trim,x,.27,along-4.4,along+4.4,3.74,.20,'yard-loading-lintel');
        yield* part(M.paint,x+side*outward*1.4,.22,along-4.6,along-4.38,.96,1,'yard-bollard',true,undefined,0xd6aa42);
      }
    }
    for(let along=s+50;along<s+230;along+=20) {
      yield* part(M.trim,side*21,7,along,along+.14,.51,.035,'yard-loading-marking',false,undefined,0xd6bc6d);
      yield* part(M.steel,side*109.5,4,along,along+1,.51,.035,'yard-channel-drain');
    }
    yield* roofUnit(29,s+130,4.2);yield* roofUnit(96,s+205,4.2);
    const gantry=s+150;
    for(const distance of [102,117])yield* part(M.steel,side*distance,.45,gantry-.3,gantry+.3,3.55,6.2,'yard-pipe-support',true,gantry);
    yield* part(M.steel,side*109.5,16,gantry-.45,gantry+.45,6.62,.45,'yard-pipe-gantry',true,gantry);
    for(const offset of [-.8,.8])if(gantry+offset>=from && gantry+offset<to) {
      const pipe=new THREE.Mesh(pipeGeometry,M.brick);pipe.scale.set(.17,16,.17);pipe.rotation.z=Math.PI/2;
      pipe.position.set(side*109.5,6.96,-(gantry+offset-from));pipe.name='yard-service-pipe';
      pipe.userData.levelBase=gantry;pipe.userData.sceneryTint=0x98704c;yield pipe;
    }
    for(const along of [s+142,s+274]) {
      yield* part(M.brick,side*126,3.8,along-3,along+3,.86,.8,'yard-freight-pallet',true);
      yield* part(M.trim,side*126,3.4,along-2.6,along+2.6,1.85,1.2,'yard-freight-crate',true,undefined,0xb98d55);
      for(const offset of [-1.1,1.1])yield* part(M.steel,side*(126+offset),.12,along-2.65,along+2.65,1.85,1.25,'yard-crate-strap');
    }
  }
}
