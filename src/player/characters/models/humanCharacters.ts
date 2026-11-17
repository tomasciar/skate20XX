import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {headSurface,surfacePatch,sweptLockGeometry,croppedHairGeometry,groomedHairGeometry} from '../geometry.ts';
import {characterPalette} from '../catalog.ts';
import {nativeFaceDetails,finishNativeFaceDetails,createRefinedFaceArtwork} from '../faces/refinedFaceArtwork.ts';

export type HumanRider='shaggy'|'light';
type Point=readonly[number,number,number];
const COLORS={shaggy:{skin:0xefc28e,hair:0x825d35,shirt:0x97b94a,shoe:0x28251f},
  light:{skin:0xdfb294,hair:0x6f452f,shirt:0xc3a678,shoe:0x292626}};
const material=(color:number)=>new THREE.MeshStandardMaterial({color,roughness:.85});
function mesh(parent:THREE.Object3D,geometry:THREE.BufferGeometry,mat:THREE.Material,x=0,y=0,z=0) {
  const object=new THREE.Mesh(geometry,mat);object.position.set(x,y,z);parent.add(object);return object;
}
function oval(parent:THREE.Object3D,mat:THREE.Material,center:Point,size:Point) {
  mesh(parent,new THREE.SphereGeometry(1,12,10),mat,...center).scale.set(...size);
}
function line(parent:THREE.Object3D,mat:THREE.Material,points:THREE.Vector3[],radius=.0018) {
  mesh(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),Math.max(8,points.length*4),radius,5,false),mat);
}

/** Continuous side/nape coverage under individual locks; neither hairstyle leaves a bald reverse view. */
function hairCap(id:HumanRider) {return id==='light'?groomedHairGeometry():croppedHairGeometry(id);}

export function addHumanHead(parent:THREE.Group,id:HumanRider) {
  const details=nativeFaceDetails(parent,id),palette=characterPalette(id,'skate');
  const ink=material(0x30251f),skin=material(palette.skin),hair=material(palette.hair),white=material(0xf9f3e5);
  const face=(mat:THREE.Material,points:readonly(readonly[number,number])[],offset=.002)=>
    mesh(details,surfacePatch(points,(x,y)=>headSurface(x,y,id),false,offset,1),mat);
  const stroke=(mat:THREE.Material,points:readonly(readonly[number,number])[],radius=.0018)=>
    line(details,mat,points.map(([x,y])=>new THREE.Vector3(x,y,headSurface(x,y,id)-.0035)),radius);
  const dot=(mat:THREE.Material,x:number,y:number,rx:number,ry:number,offset:number)=>
    face(mat,Array.from({length:16},(_,i)=>[x+Math.cos(i/16*Math.PI*2)*rx,y+Math.sin(i/16*Math.PI*2)*ry] as const),offset);
  for(const side of [-1,1]) {
    oval(parent,skin,[side*.084,-.018,.002],[.016,.025,.015]);
    stroke(material(0xba8d6c),[[side*.094,-.007],[side*.096,-.018],[side*.091,-.028]],.0013);
    const x=side*.031,y=-.015;
    if(id==='shaggy') {
      dot(ink,x,y,.016,.022,.002);dot(white,x,y,.0138,.019,.0027);
      dot(ink,x+side*.001,y-.002,.0037,.007,.0036);
      stroke(hair,[[x-.014,.020],[x-.003,.028],[x+.013,.023]],.0031);
    } else {
      // Narrow angular lids and a small brown iris keep Light distinct from the round-eyed cast.
      const eye=(sx:number,sy:number)=>[[-sx,-.001],[-sx*.58,sy],[sx*.46,sy*.65],[sx,-.002],[sx*.44,-sy*.6],[-sx*.65,-sy*.6]]
        .map(([dx,dy])=>[x+dx!,y+dy!] as const);
      face(ink,eye(.022,.010),.002);face(white,eye(.0185,.0078),.003);
      dot(material(0x8e5532),x,y,.007,.0065,.0038);dot(ink,x,y,.0038,.006,.0045);
      dot(white,x-.002,y+.002,.0016,.0016,.005);
      stroke(hair,[[x-side*.018,.008],[x,.015],[x+side*.019,.012]],.0028);
      stroke(material(0xc99878),[[x-side*.019,-.029],[x+side*.015,-.029]],.0012);
    }
  }
  if(id==='shaggy') {
    const z=headSurface(0,-.042,id);
    oval(parent,skin,[0,-.044,z-.017],[.014,.023,.030]);
    stroke(ink,[[-.034,-.078],[-.012,-.085],[.011,-.085],[.032,-.076]],.0021);
    stroke(material(0xb17d58),[[-.010,-.057],[.001,-.062],[.010,-.058]],.0014);
    // A few separate goatee hairs, rather than a solid beard painted over the chin.
    for(const x of [-.011,0,.011])stroke(hair,[[x,-.116],[x*.8,-.128]],.0015);
    stroke(ink,[[-.033,-.077],[-.036,-.069]],.0015);
  } else {
    const z=headSurface(0,-.036,id);
    oval(parent,skin,[0,-.036,z-.004],[.008,.018,.011]);
    stroke(material(0xb88269),[[.004,-.045],[.011,-.047],[.015,-.043]],.0012);
    stroke(ink,[[-.023,-.068],[-.002,-.071],[.020,-.066]],.0017);
    stroke(material(0xc18e73),[[-.010,-.078],[.011,-.077]],.0011);
  }
  mesh(parent,hairCap(id),hair);
  const lock=(root:Point,bend:Point,tip:Point,width:number,depth:number)=>
    mesh(parent,sweptLockGeometry(root,bend,tip,width,depth,6,8),hair);
  if(id==='shaggy') {
    // Narrow overlapping locks follow his flat scruffy crown; avoid the three giant helmet lobes.
    for(const [i,x] of [-.061,-.036,-.010,.018,.046].entries()) {
      lock([x*.85,.087+Math.sin(i)*.009,-.041],[x-.012,.064,-.086],
        [x+(i%2?.006:-.009),.026+(i%3)*.008,-.088],.036,.019);
    }
    for(const side of [-1,1])for(let i=0;i<3;i++) {
      lock([side*(.061+i*.005),.065-i*.016,-.010+i*.029],
        [side*(.086+i*.004),.026-i*.020,.009+i*.031],
        [side*(.091+i*.009),-.017-i*.022,.010+i*.030],.033,.022);
    }
    for(let i=0;i<6;i++) {
      const x=-.058+i*.023;
      lock([x,.054,.063],[x+.009,-.002,.087],[x+(i%2?.008:-.008),-.074-(i%3)*.006,.073],.031,.018);
    }
    for(let i=0;i<4;i++) {
      const x=-.049+i*.029;
      lock([x,.098,.005],[x-.014,.123,.008],[x-.026,.125+(i%2)*.006,-.006],.030,.018);
    }
    const strand=material(0x6e4d2e);
    for(let i=0;i<5;i++) {
      const x=-.052+i*.025;
      line(parent,strand,[new THREE.Vector3(x,.104,-.025),new THREE.Vector3(x-.011,.077,-.074),new THREE.Vector3(x-.009,.047,-.085)],.0008);
    }
  } else {
    // Overlapping tapered sheets sweep down from a side part instead of an evenly spiked crown.
    for(const [root,bend,tip,width] of [
      [[-.060,.075,-.025],[-.075,.049,-.077],[-.073,-.017,-.067],.046],
      [[-.046,.087,-.025],[-.022,.066,-.095],[.014,.008,-.101],.064],
      [[-.015,.090,-.023],[.015,.077,-.101],[.047,.009,-.099],.058],
      [[.020,.087,-.019],[.053,.065,-.092],[.076,-.011,-.074],.051],
      [[.072,.068,-.012],[.094,.018,-.062],[.084,-.038,-.048],.043],
    ] as const)lock(root,bend,tip,width,.020);
    // Rear and side detail is cut into the uniform silhouette, rather than sticking out as spikes.
    const strand=material(0x63402e);
    for(const side of [-1,1])for(let i=0;i<5;i++) {
      const a=side*(1.05+i*.38);
      const points=[.073,.034,-.010,-.044].map(y=>{
        const r=Math.sqrt(Math.max(.01,1-((y-.022)/.116)**2));
        return new THREE.Vector3(Math.sin(a)*.0955*r,y,.007-Math.cos(a)*.0885*r);
      });
      line(parent,strand,points,.0007);
    }
  }
  finishNativeFaceDetails(details,id);parent.add(createRefinedFaceArtwork(id));
  parent.scale.setScalar(id==='shaggy'?1.04:1.12);
  ink.dispose();skin.dispose();hair.dispose();white.dispose();
}

export function addHumanOutfit(parent:THREE.Group,id:HumanRider,surface:(x:number,y:number)=>number) {
  const patch=(color:number,points:readonly(readonly[number,number])[],offset=.003)=>
    mesh(parent,surfacePatch(points,surface,false,offset,2),material(color));
  const stroke=(color:number,points:readonly(readonly[number,number])[],radius=.002,offset=.004)=>
    line(parent,material(color),points.map(([x,y])=>new THREE.Vector3(x,y,surface(x,y)-offset)),radius);
  if(id==='shaggy') {
    patch(COLORS[id].skin,[[-.049,.423],[.049,.423],[0,.343]],.003);
    stroke(0x6a9130,[[-.052,.416],[0,.337],[.052,.416]],.004);
    stroke(0x7da53b,[[-.098,.108],[-.047,.116],[.006,.109],[.082,.117]],.002);
    for(const side of [-1,1])stroke(0x7da53b,[[side*.111,.262],[side*.091,.194]],.0018);
  } else {
    // White shirt, separate collar points, burgundy knot/tie, and overlapping notched lapels.
    patch(0xf4f0e3,[[-.062,.420],[.062,.420],[.051,.294],[0,.204],[-.048,.296]],.003);
    patch(0xd1b48b,[[-.079,.418],[-.025,.369],[-.043,.342],[-.021,.322],[-.009,.226],[-.107,.358]],.005);
    patch(0xd1b48b,[[.079,.418],[.025,.369],[.043,.342],[.021,.322],[.009,.226],[.107,.358]],.005);
    patch(0xffffff,[[-.049,.417],[0,.397],[-.021,.367],[-.055,.397]],.007);
    patch(0xffffff,[[.049,.417],[0,.397],[.021,.367],[.055,.397]],.007);
    patch(0x9b3340,[[-.013,.395],[.013,.395],[.010,.377],[0,.368],[-.010,.377]],.009);
    patch(0x9b3340,[[-.007,.371],[.007,.371],[.018,.267],[0,.244],[-.018,.267]],.009);
    for(const y of [.278,.307,.336])stroke(0xe0b7a4,[[-.010,y+.004],[.009,y-.003]],.0012,.010);
    for(const side of [-1,1]) {
      stroke(0xa58b67,[[side*.080,.413],[side*.027,.367],[side*.043,.342],[side*.021,.322],[0,.221]],.0016,.007);
      stroke(0xa58b67,[[side*.064,.166],[side*.110,.173]],.002);
    }
    stroke(0xa58b67,[[-.065,.307],[-.107,.314]],.002);
    for(const y of [.178,.220])oval(parent,material(0x65533e),[.010,y,surface(.010,y)-.005],[.005,.005,.002]);
    // A center seam and low jacket vents are readable from the follow camera.
    line(parent,material(0xb19772),[new THREE.Vector3(0,.380,.105),new THREE.Vector3(0,.210,.103),new THREE.Vector3(0,.077,.090)],.0016);
  }
}

export function addHumanLimbDetails(parent:THREE.Group,id:HumanRider,kind:'upperarm'|'forearm'|'shin') {
  if(id==='light'&&kind==='forearm') {
    mesh(parent,new THREE.CylinderGeometry(.028,.030,.10,12,1,true),material(0xf4f0e3),0,.441,0);
    for(const y of [.27,.33])oval(parent,material(0x65533e),[.028,y,-.010],[.003,.010,.005]);
  }
  if(id==='shaggy'&&kind==='shin') {
    const geo=new THREE.LatheGeometry([[.39,.077],[.46,.082],[.50,.083]].map(([y,r])=>new THREE.Vector2(r!,y!)),12);
    mesh(parent,geo,material(0x703c2c));
  }
}

export function addHumanShoeDetails(parent:THREE.Group,id:HumanRider) {
  mesh(parent,new RoundedBoxGeometry(.104,.028,.159,2,.009),material(COLORS[id].shoe),0,.054,-.021);
  if(id==='light')for(const side of [-1,1])
    mesh(parent,new RoundedBoxGeometry(.006,.009,.120,1,.002),material(0x41382e),side*.054,.020,-.024);
}
