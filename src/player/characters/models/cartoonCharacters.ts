import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {headSurface,surfacePatch} from '../geometry.ts';
import {batchCosmetics} from '../cosmetics.ts';
import {characterPalette} from '../../../characters.ts';
import {nativeFaceDetails,finishNativeFaceDetails,createRefinedFaceArtwork} from '../faces/refinedFaceArtwork.ts';

export type CartoonRider='finn'|'bart';
const COLORS={finn:{skin:0xf6cc95,shirt:0x40bce9,shorts:0x1e76c5,shoe:0x19232a},
  bart:{skin:0xffd62a,shirt:0xef532d,shorts:0x2488c7,shoe:0x2488c7}};
const material=(color:number)=>new THREE.MeshStandardMaterial({color,roughness:.85});
function mesh(parent:THREE.Object3D,geometry:THREE.BufferGeometry,mat:THREE.Material,x=0,y=0,z=0) {
  const object=new THREE.Mesh(geometry,mat);object.position.set(x,y,z);parent.add(object);return object;
}
function oval(parent:THREE.Object3D,mat:THREE.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number) {
  return mesh(parent,new THREE.SphereGeometry(1,16,12),mat,x,y,z).scale.set(sx,sy,sz);
}
function line(parent:THREE.Object3D,mat:THREE.Material,points:THREE.Vector3[],radius=.002,closed=false) {
  return mesh(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,closed),Math.max(12,points.length*3),radius,6,closed),mat);
}
function patch(parent:THREE.Object3D,id:CartoonRider,mat:THREE.Material,points:readonly(readonly[number,number])[],offset=.002) {
  return mesh(parent,surfacePatch(points,(x,y)=>headSurface(x,y,id),false,offset,1),mat);
}

/** Cloth hood with a face opening, rather than a white helmet painted over the forehead. */
export function finnHatGeometry() {
  // The ears are raised areas of the same cloth surface, with broad blended roots.
  // No intersecting capsules or dark seam can separate an ear from the hood.
  const rings=[[.091,.063,-.007,-.077,0],[.106,.100,.004,-.078,.40],[.117,.116,.010,-.052,.88],
    [.120,.122,.010,-.025,1],[.121,.120,.010,.005,1],[.115,.116,.010,.035,.82],
    [.110,.108,.010,.058,.40],[.077,.082,.010,.091,.04],[.036,.043,.010,.113,0],[.001,.001,.010,.120,0]];
  const positions:number[]=[],indices:number[]=[],segments=64;
  for(let ring=0;ring<rings.length;ring++)for(let segment=0;segment<=segments;segment++) {
    const [rx,ry,cy,z,earWeight]=rings[ring]!,angle=segment/segments*Math.PI*2;
    const x=Math.cos(angle)*rx!,baseY=cy!+Math.sin(angle)*ry!;
    const distance=Math.abs(Math.abs(x)-.080);
    const ears=Math.sin(angle)>0?1-THREE.MathUtils.smoothstep(distance,.020,.036):0;
    const earTop=.153+.034*Math.sqrt(Math.max(0,1-(distance/.029)**2))-.008*(z!/.065)**2;
    positions.push(x,THREE.MathUtils.lerp(baseY,earTop,earWeight!*ears),z!);
    if(ring<rings.length-1&&segment<segments){const a=ring*(segments+1)+segment,b=a+1,c=a+segments+1;indices.push(a,b,c,b,c+1,c);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

/** A continuous yellow sawtooth crown: the silhouette stays jagged from the sides and rear too. */
export function bartCrownGeometry() {
  const positions:number[]=[],indices:number[]=[],segments=36;
  for(let ring=0;ring<2;ring++)for(let segment=0;segment<segments;segment++) {
    const angle=segment/segments*Math.PI*2,s=Math.sin(angle),c=Math.cos(angle);
    const x=Math.sign(s)*Math.pow(Math.abs(s),.55)*.091,z=-Math.sign(c)*Math.pow(Math.abs(c),.55)*.066+.008;
    positions.push(x,ring===0?.093:segment%2?.153+Math.sin(angle*3)*.003:.116,z);
  }
  const center=positions.length/3;positions.push(0,.128,.008);
  for(let i=0;i<segments;i++) {
    const next=(i+1)%segments;indices.push(i,i+segments,next,next,i+segments,next+segments);
    indices.push(center,next+segments,i+segments);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export function addCartoonHead(parent:THREE.Group,id:CartoonRider) {
  const details=nativeFaceDetails(parent,id);
  const ink=material(0x1b1b18),skin=material(characterPalette(id,'skate').skin),white=material(0xf9faf0);
  if(id==='finn') {
    mesh(parent,finnHatGeometry(),white);
    for(const side of [-1,1]) {
      oval(details,ink,side*.033,.004,headSurface(side*.033,.004,id)-.0015,.006,.008,.003);
    }
    const rim=Array.from({length:40},(_,i)=>{const a=i/40*Math.PI*2;return new THREE.Vector3(Math.cos(a)*.091,-.007+Math.sin(a)*.063,-.0775);});
    line(parent,material(0xd6dfd6),rim,.0015,true);
    line(details,ink,[[-.016,-.034],[0,-.035],[.016,-.034]].map(([x,y])=>new THREE.Vector3(x!,y!,headSurface(x!,y!,id)-.003)),.0015);
    // A soft back seam emphasizes fabric and ties the two bear ears into the hood.
    line(parent,material(0xe0e7dc),[new THREE.Vector3(0,-.088,.079),new THREE.Vector3(0,.012,.104),new THREE.Vector3(0,.112,.051)],.0013);
  } else {
    mesh(parent,bartCrownGeometry(),skin);
    for(const side of [-1,1]) {
      oval(parent,skin,side*.091,-.026,.010,.018,.024,.014);
      line(parent,ink,[new THREE.Vector3(side*.106,-.012,-.002),new THREE.Vector3(side*.110,-.025,-.005),new THREE.Vector3(side*.104,-.034,-.003)],.0015);
      const x=side*.035;
      const ellipse=(rx:number,ry:number)=>Array.from({length:24},(_,i)=>[x+Math.cos(i/24*Math.PI*2)*rx,-.006+Math.sin(i/24*Math.PI*2)*ry] as const);
      patch(details,id,ink,ellipse(.034,.037),.003);
      patch(details,id,white,ellipse(.0315,.0345),.004);
      patch(details,id,ink,Array.from({length:16},(_,i)=>[x-side*.002+Math.cos(i/16*Math.PI*2)*.0057,-.008+Math.sin(i/16*Math.PI*2)*.008] as const),.005);
    }
    // A closed grin is filled edge-to-edge with teeth; the separators follow the curved dental arch.
    patch(details,id,ink,[[-.048,-.069],[-.022,-.072],[.006,-.073],[.033,-.071],[.050,-.066],
      [.045,-.080],[.026,-.088],[0,-.091],[-.027,-.087],[-.042,-.079]],.003);
    patch(details,id,white,[[-.044,-.072],[-.020,-.075],[.006,-.076],[.031,-.074],[.045,-.070],
      [.041,-.079],[.025,-.085],[0,-.088],[-.025,-.084],[-.038,-.078]],.004);
    for(const [x,top,bottom] of [[-.029,-.073,-.084],[-.010,-.075,-.087],[.012,-.075,-.087],[.031,-.073,-.083]]) {
      const inward=-Math.sign(x!)*.003;
      line(details,ink,[new THREE.Vector3(x!,top!,headSurface(x!,top!,id)-.0055),
        new THREE.Vector3(x!+inward*.4,(top!+bottom!)/2,headSurface(x!+inward*.4,(top!+bottom!)/2,id)-.0055),
        new THREE.Vector3(x!+inward,bottom!,headSurface(x!+inward,bottom!,id)-.0055)],.0008);
    }
    line(details,ink,[[.049,-.063],[.058,-.062],[.061,-.052]].map(([x,y])=>new THREE.Vector3(x!,y!,headSurface(x!,y!,id)-.0025)),.0016);
  }
  finishNativeFaceDetails(details,id);parent.add(createRefinedFaceArtwork(id));
  parent.scale.setScalar(id==='finn'?1.18:1.32);
  ink.dispose();skin.dispose();white.dispose();
}

/** Finn's original golden sword, Scarlet. Everything is rigidly attached to the right wrist. */
export function addFinnSword(hand:THREE.Mesh) {
  const sword=new THREE.Group();sword.name='character-sword-finn';sword.userData.characterSkin='finn';
  sword.userData.characterAttachment=true;hand.add(sword);
  // The blade exits on the thumb side of the grip, rather than pointing down past the fingers.
  sword.position.set(-.022,.033,.006);sword.rotation.set(.10,0,Math.PI-.80);
  const gold=material(0xe1b73f),edge=material(0xf7dc74),grip=material(0x815337),gem=material(0xb33d36);
  mesh(sword,new THREE.CylinderGeometry(.011,.011,.087,8),grip,0,.005,0);
  oval(sword,gold,0,-.048,0,.019,.016,.013);
  oval(sword,gem,0,-.049,-.012,.009,.008,.003);
  mesh(sword,new RoundedBoxGeometry(.115,.022,.025,1,.006),gold,0,.055,0);
  // Diamond cross section: two contrasting gold facets, a long straight blade and pointed tip.
  const positions=[-.029,.067,0, 0,.067,-.008, .029,.067,0, 0,.067,.008,
    -.025,.516,0, 0,.516,-.006, .025,.516,0, 0,.516,.006, 0,.590,0];
  const indices=[0,4,1,1,4,5,1,5,2,2,5,6,2,6,3,3,6,7,3,7,0,0,7,4,4,8,5,5,8,6,6,8,7,7,8,4];
  const blade=new THREE.BufferGeometry();blade.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));blade.setIndex(indices);blade.computeVertexNormals();
  mesh(sword,blade,gold);
  mesh(sword,new THREE.BoxGeometry(.003,.437,.002),edge,-.001,.291,-.0085);
  batchCosmetics(sword);gold.dispose();edge.dispose();grip.dispose();gem.dispose();
}

export function addCartoonOutfit(parent:THREE.Group,id:CartoonRider,frontSurface:(x:number,y:number)=>number) {
  const trim=material(id==='finn'?0x339bd3:0xd63e20);
  // A narrow rolled collar and hem, with no hoodie cords or racing stripes.
  mesh(parent,new THREE.TorusGeometry(.053,.008,6,20),trim,0,.418,0).rotation.x=Math.PI/2;
  if(id==='finn') {
    const upper=material(0xb4d779),lower=material(0x579346),edge=material(0x427a36);
    for(const [start,mat] of [[0,upper],[Math.PI/2,lower]] as const) {
      mesh(parent,new THREE.SphereGeometry(1,24,12,0,Math.PI*2,start,Math.PI/2),mat,0,.266,.171).scale.set(.157,.170,.083);
    }
    const seam=Array.from({length:40},(_,i)=>{const a=i/40*Math.PI*2;return new THREE.Vector3(Math.cos(a)*.157,.266,.171+Math.sin(a)*.083);});
    line(parent,edge,seam,.0024,true);
    oval(parent,material(0xd8ecaa),0,.266,.256,.013,.013,.004);
    for(const side of [-1,1]) {
      const front=[[side*.105,.117],[side*.111,.185],[side*.118,.290],[side*.110,.390]];
      line(parent,lower,[...front.map(([x,y])=>new THREE.Vector3(x!,y!,frontSurface(x!,y!)-.008)),
        new THREE.Vector3(side*.113,.418,.042),new THREE.Vector3(side*.123,.362,.135)],.009);
      mesh(parent,new RoundedBoxGeometry(.023,.027,.008,1,.003),upper,side*.111,.185,frontSurface(side*.111,.185)-.013);
    }
    // Lower pocket curve and fabric pull tab read clearly from the chase camera.
    line(parent,edge,[new THREE.Vector3(-.105,.246,.233),new THREE.Vector3(-.074,.185,.235),new THREE.Vector3(0,.169,.239),new THREE.Vector3(.074,.185,.235),new THREE.Vector3(.105,.246,.233)],.0024);
    mesh(parent,new RoundedBoxGeometry(.014,.031,.009,1,.003),lower,.113,.296,.227).rotation.z=-.2;
  } else {
    mesh(parent,new THREE.CylinderGeometry(.138,.138,.016,24,1,true),trim,0,.063,0).scale.z=.64;
  }
  trim.dispose();
}

export function addCartoonLimbDetails(parent:THREE.Group,id:CartoonRider,kind:'upperarm'|'forearm'|'shin'|'thigh') {
  if(kind==='thigh') {
    const cloth=material(COLORS[id].shorts),edge=material(id==='finn'?0x1b66a2:0x1974ad);
    mesh(parent,new THREE.LatheGeometry([[-.5,.087],[-.4,.096],[-.1,.093],[.14,.089],[.18,.086]].map(([y,r])=>new THREE.Vector2(r!,y!)),16),cloth);
    mesh(parent,new THREE.CylinderGeometry(.089,.087,.045,16,1,true),edge,0,.16,0);
  } else if(kind==='shin') {
    const sock=material(0xf6f6e8),fold=material(0xd8e0d9);
    mesh(parent,new THREE.LatheGeometry([[.06,.038],[.10,.041],[.16,.036],[.34,.032],[.5,.031]].map(([y,r])=>new THREE.Vector2(r!,y!)),12),sock);
    mesh(parent,new THREE.CylinderGeometry(.041,.041,.045,12),fold,0,.105,0);
  } else if(kind==='upperarm') {
    mesh(parent,new THREE.CylinderGeometry(.055,.054,.045,12,1,true),material(COLORS[id].shirt),0,.02,0);
  }
}

export function addCartoonShorts(parent:THREE.Mesh) {
  for(const id of ['finn','bart'] as const) {
    const group=new THREE.Group();group.userData.characterSkin=id;group.name=`character-thigh-${id}`;parent.add(group);
    addCartoonLimbDetails(group,id,'thigh');batchCosmetics(group);
  }
}

export function addCartoonShoeDetails(parent:THREE.Group,id:CartoonRider) {
  const shoe=material(COLORS[id].shoe),sole=material(0xf1f1df);
  mesh(parent,new RoundedBoxGeometry(.103,.029,.156,2,.009),shoe,0,.054,-.021);
  if(id==='bart') {
    for(const side of [-1,1])mesh(parent,new RoundedBoxGeometry(.006,.019,.10,1,.003),sole,side*.054,.027,-.025);
    mesh(parent,new RoundedBoxGeometry(.050,.026,.009,1,.003),sole,0,.035,.084);
  }
  shoe.dispose();sole.dispose();
}
