import * as THREE from 'three';
import {CHARACTERS,characterPalette,characterProportions} from '../characters.ts';
import type {CharacterId} from '../characters.ts';
import {batchCosmetics} from './cosmetics.ts';
import {headGeometry,headSurface,surfacePatch,sweptLockGeometry,torsoRadius,torsoCenter,stuntHelmetGeometry,stuntHelmetRim,ribbonGeometry} from './modelGeometry.ts';
import {addGokuHair,addNarutoHair,addPonytail} from './characterHair.ts';
import {createFaceArtwork,hasFaceArtwork} from './faceArtwork.ts';
import {turtleSchoolStrokes,hiddenLeafStrokes,uzumakiWhorl} from './characterInsignia.ts';
import {addCartoonHead,addCartoonOutfit,addCartoonLimbDetails,addCartoonShorts,addCartoonShoeDetails} from './cartoonCharacters.ts';
import {addHumanHead,addHumanOutfit,addHumanLimbDetails,addHumanShoeDetails} from './humanCharacters.ts';
import {addPeterHead,addPeterOutfit,addPeterLimbDetails,addPeterShoeDetails} from './peterCharacter.ts';
import {addAnimeGuestHead,addAnimeGuestOutfit,addSasukeShorts,addAnimeGuestLimb,addAnimeGuestShoe} from './animeGuests.ts';
import {addSpiderHead,addSpiderOutfit,addSpiderLimb,addSpiderShoe} from './spiderMan.ts';
import {addMichaelHead,addMichaelOutfit,addMichaelLimb,addMichaelShoe} from './michaelJackson.ts';

const up=new THREE.Vector3(0,1,0);
const material=(color:number)=>new THREE.MeshStandardMaterial({color});
function mesh(parent:THREE.Object3D,geometry:THREE.BufferGeometry,mat:THREE.Material,x=0,y=0,z=0) {
  const object=new THREE.Mesh(geometry,mat);object.position.set(x,y,z);parent.add(object);return object;
}
function box(parent:THREE.Object3D,size:number[],mat:THREE.Material,x=0,y=0,z=0) {
  return mesh(parent,new THREE.BoxGeometry(size[0],size[1],size[2]),mat,x,y,z);
}
function oval(parent:THREE.Object3D,mat:THREE.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number) {
  return mesh(parent,new THREE.SphereGeometry(1,12,10),mat,x,y,z).scale.set(sx,sy,sz);
}
function look(parent:THREE.Object3D,id:CharacterId,kind:string) {
  const group=new THREE.Group();group.userData.characterSkin=id;group.name=`character-${kind}-${id}`;parent.add(group);return group;
}
function stroke(parent:THREE.Object3D,mat:THREE.Material,points:number[][],width:number,z:number) {
  for(let i=1;i<points.length;i++) {
    const a=new THREE.Vector3(points[i-1]![0],points[i-1]![1],z),b=new THREE.Vector3(points[i]![0],points[i]![1],z);
    const line=box(parent,[width,a.distanceTo(b),0.003],mat);line.position.copy(a).add(b).multiplyScalar(0.5);
    line.quaternion.setFromUnitVectors(up,b.sub(a).normalize());
  }
}


/** Distinct silhouettes and tailored outfits, all attached to the shared animated skeleton. */
export function addCharacterLooks(head:THREE.Group,torso:THREE.Group) {
  const costumes=new THREE.Group();costumes.userData.characterAttachment=true;torso.add(costumes);
  for(const {id} of CHARACTERS) {
    const p=characterPalette(id,'skate'),skin=material(p.skin),hair=material(p.hair),accent=material(p.accent),shell=material(p.helmet);
    const ink=material(0x18202c),white=material(0xf7f3df),steel=material(0xa6bdc8),shirt=material(p.shirt),dark=material(p.sleeves);
    const group=look(head,id,'head'),outfit=look(costumes,id,'outfit');
    group.userData.profile=id==='goku'?'swept-spikes':id==='naruto'?'layered-spikes':id==='kick'?'full-stunt-helmet':'skate-helmet';
    const cartoon=id==='finn'||id==='bart';
    const human=id==='shaggy'||id==='light';
    const anime=id==='sasuke'||id==='onizuka',guest=anime||id==='spiderman'||id==='mj';
    if(cartoon)group.userData.profile=id==='finn'?'bear-ear-hood':'serrated-crown';
    if(human)group.userData.profile=id==='shaggy'?'scruffy-fringe':'swept-fringe';
    if(id==='peter')group.userData.profile='round-glasses-cleft-chin';
    if(guest)group.userData.profile=id==='spiderman'?'webbed-mask':id==='sasuke'?'rear-fan-long-bangs':id==='mj'?'fedora-curls':'bleached-crop';
    const {chestWidth:width,chestDepth:depth}=characterProportions(id);
    const clothSurface=(back:boolean)=>(x:number,y:number)=>{const r=torsoRadius(y,id);return torsoCenter(y,id)*depth+(back?1:-1)*r*depth*Math.sqrt(Math.max(.015,1-(x/(r*width))**2));};
    const clothMark=(mat:THREE.Material,points:readonly(readonly[number,number])[],back=false,offset=.003,subdivisions=2)=>mesh(outfit,surfacePatch(points,clothSurface(back),back,offset,subdivisions),mat);
    const clothStroke=(mat:THREE.Material,points:readonly(readonly[number,number])[],thickness:number,back=false,offset=.0035,subdivisions=2)=>{
      for(let i=1;i<points.length;i++) {
        const [ax,ay]=points[i-1]!,[bx,by]=points[i]!,length=Math.hypot(bx-ax,by-ay),nx=-(by-ay)/length*thickness/2,ny=(bx-ax)/length*thickness/2;
        clothMark(mat,[[ax+nx,ay+ny],[bx+nx,by+ny],[bx-nx,by-ny],[ax-nx,ay-ny]],back,offset,subdivisions);
      }
    };
    const clothDisk=(mat:THREE.Material,r:number,x:number,y:number,back:boolean,offset=.003)=>clothMark(mat,Array.from({length:32},(_,i)=>[x+Math.cos(i/32*Math.PI*2)*r,y+Math.sin(i/32*Math.PI*2)*r] as const),back,offset);
    const band=(mat:THREE.Material,y:number,height:number)=>{
      const item=mesh(outfit,new THREE.CylinderGeometry(torsoRadius(y+height/2)+.004,torsoRadius(y-height/2)+.004,height,24,1,true),mat,0,y,0);
      item.scale.set(width,1,depth);
    };

    mesh(group,headGeometry(id),skin);
    const faceSurface=(x:number,y:number)=>headSurface(x,y,id);
    const faceMark=(mat:THREE.Material,points:readonly(readonly[number,number])[],offset=0.0012)=>mesh(group,surfacePatch(points,faceSurface,false,offset),mat);
    if(!cartoon&&!human&&id!=='peter'&&!guest)for(const side of [-1,1]) {
      oval(group,skin,side*0.086,-0.005,0,0.017,0.025,0.015);
      oval(group,material(0xb87863),side*0.098,-0.005,-0.001,0.003,0.013,0.008);
      if(!hasFaceArtwork(id)) {
        const cx=side*0.033,cy=-0.002;
        const outline=material(0x302924),iris=material(id==='girl'?0x49705d:0x70523b);
        // Readable eyelids and sclera matter more than tiny realistic marks at the follow-camera distance.
        const eyeShape=(sx:number,sy:number)=>[[-sx,0],[-sx*.62,sy*.42],[-sx*.12,sy*.55],[sx*.4,sy*.45],[sx,0],[sx*.6,-sy*.38],[0,-sy*.5],[-sx*.6,-sy*.36]].map(([x,y])=>[cx+x!,cy+y!] as const);
        const eyeOval=(mat:THREE.Material,rx:number,ry:number,offset:number,x=cx,y=cy)=>faceMark(mat,Array.from({length:12},(_,i)=>[x+Math.cos(i/12*Math.PI*2)*rx,y+Math.sin(i/12*Math.PI*2)*ry] as const),offset);
        faceMark(outline,eyeShape(.021,.026),.0014);
        faceMark(white,eyeShape(.0185,.0205),.0022);
        eyeOval(iris,.007,.009,.003);
        eyeOval(ink,.0035,.0075,.0037);
        eyeOval(white,.0018,.0018,.0042,cx-.0015,cy+.0033);
        const tilt=side*.035,browY=.020;
        faceMark(hair,[[cx-.018,browY-tilt*.018],[cx+.017,browY+tilt*.017],[cx+.017,browY+.005+tilt*.017],[cx-.018,browY+.005-tilt*.018]],.002);
      }
    }
    if(cartoon)addCartoonHead(group,id);
    else if(human)addHumanHead(group,id);
    else if(id==='peter')addPeterHead(group);
    else if(anime)addAnimeGuestHead(group,id);
    else if(id==='spiderman')addSpiderHead(group);
    else if(id==='mj')addMichaelHead(group);
    else if(hasFaceArtwork(id))group.add(createFaceArtwork(id));
    else {
      const noseZ=headSurface(0,-.025,id)-.003;
      oval(group,skin,0,-.025,noseZ,.011,.019,.014);
      for(const side of [-1,1])oval(group,material(0x9a6150),side*.005,-.033,noseZ-.011,.0025,.0016,.002);
      faceMark(material(0x713d35),[[-.019,-.058],[-.008,-.061],[.008,-.061],[.019,-.058],[.016,-.063],[0,-.066],[-.016,-.063]],.0018);
      faceMark(material(0xaf6d5c),[[-.011,-.067],[.011,-.067],[.008,-.069],[-.008,-.069]],.0015);
    }
    if(id==='boy' || id==='girl') {
      mesh(group,new THREE.SphereGeometry(0.108,20,12,0,Math.PI*2,0,Math.PI*0.55),shell,0,0.031,0);
      box(group,[0.158,0.013,0.066],shell,0,0.034,-0.09);
      // Vents, chin straps, and contrasting rim read from the follow camera too.
      for(const side of [-1,1]) {
        for(const z of [-.35,0,.35]) {
          const normal=new THREE.Vector3(side*.79,.52,z).normalize();
          const vent=mesh(group,new THREE.SphereGeometry(1,8,6),ink,normal.x*.109,normal.y*.109+.031,normal.z*.109);
          vent.scale.set(.004,.0018,.014);vent.quaternion.setFromUnitVectors(up,normal);
        }
        const strap=new THREE.CatmullRomCurve3([new THREE.Vector3(side*.095,.013,-.01),new THREE.Vector3(side*.075,-.05,-.012),new THREE.Vector3(side*.02,-.096,-.018)]);
        mesh(group,new THREE.TubeGeometry(strap,12,.003,6,false),ink);
      }
      box(group,[0.073,0.018,0.009],accent,0,0.035,0.103);
      if(id==='girl') {
        addPonytail(group,hair,accent);
      } else {
        for(let i=0;i<6;i++) {
          const x=-.061+i*.024,y=-.047-(i%3)*.004;
          mesh(group,sweptLockGeometry([x,.006,.073],[x+.005,-.021,.086],[x+.007,y,.08],.029,.023),hair);
        }
      }
      const hood=mesh(outfit,new THREE.TorusGeometry(0.069,0.022,6,18,Math.PI*1.7),dark,0,0.392,0.027);hood.rotation.x=Math.PI/2;
      clothMark(accent,[[.015,.278],[.104,.278],[.104,.3],[.015,.3]]);
      for(const side of [-1,1]) {
        const cordPoints=[[side*.028,.378],[side*.03,.314],[side*.025,.253]].map(([x,y])=>new THREE.Vector3(x!,y!,clothSurface(false)(x!,y!)-.005));
        mesh(outfit,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cordPoints),12,.0025,6,false),white);
        clothMark(accent,[[side*.025-.004,.243],[side*.025+.004,.243],[side*.025+.004,.258],[side*.025-.004,.258]]);
        clothStroke(dark,[[side*.015,.14],[side*.092,.17]],.007);
      }
      band(dark,.071,.025);
      clothDisk(dark,.072,0,.26,true);
      clothMark(accent,[[0,.315],[.055,.26],[0,.205],[-.055,.26]],true,.004);
      clothStroke(white,id==='girl'?[[-.014,.285],[.014,.235]]:[[.014,.285],[-.014,.235]],.01,true,.005);
      const goggles=new THREE.Group();goggles.userData.rideSkin='snowboard';group.add(goggles);
      box(goggles,[0.168,0.053,0.03],ink,0,0.01,-0.086);
      box(goggles,[0.142,0.033,0.009],material(0x71bccc),0,0.014,-0.106);batchCosmetics(goggles);
    }
    if(id==='goku') {
      addGokuHair(group,hair);
      // Blue undershirt, overlapping orange gi lapels, and a tied waist sash.
      clothMark(accent,[[-.088,.412],[.088,.412],[0,.287]]);
      for(const side of [-1,1])clothStroke(material(0xd76124),[[side*.092,.412],[side*.008,.286]],.012,false,.0045);
      band(accent,.077,.046);
      box(outfit,[0.049,0.055,0.026],accent,-0.041,0.074,-0.107);
      for(const side of [-1,1])box(outfit,[0.025,0.115,0.015],accent,-0.04+side*0.018,-0.001,-0.11).rotation.z=side*0.19;
      for(const back of [false,true]) {
        const x=back?0:-.103,y=back?.276:.291,r=back?.079:.037;
        clothDisk(ink,r,x,y,back);clothDisk(white,r*.88,x,y,back,.004);
        // The front surface reverses screen X; keep the kanji readable from either side.
        for(const mark of turtleSchoolStrokes())clothStroke(ink,mark.points.map(([u,v])=>[x+(back?u:-u)*r*.82,y+v*r*.82] as const),mark.width*r*.82,back,.0055,1);
      }
      for(const side of [-1,1])clothStroke(material(0xde6a25),[[side*.025,.302],[side*.061,.279],[side*.13,.283]],.004);
      for(const side of [-1,1])clothStroke(material(0xdc6d28),[[side*.095,.145],[side*.063,.195],[side*.071,.237]],.004);
    }
    if(id==='naruto') {
      addNarutoHair(group,hair);
      mesh(group,new THREE.CylinderGeometry(0.103,0.103,0.036,16,1,true),ink,0,0.039,0);
      box(group,[0.103,0.032,0.014],steel,0,0.039,-0.1);
      // Leaf insignia and rivets sit clear of the plate, avoiding coplanar shimmer.
      for(const mark of hiddenLeafStrokes())stroke(group,ink,mark.points.map(([x,y])=>[-x*.018,.038+y*.018]),mark.width*.018,-.109);
      for(const side of [-1,1]) {
        for(const y of [0.028,0.039,0.050])oval(group,ink,side*0.041,y,-0.11,0.002,0.002,0.002);
        mesh(group,ribbonGeometry([side*.012,.040,.106],[side*.039,-.026,.14],[side*.044,-.099,.126],.017),ink);
      }
      // Shippuden-style dark shoulders, raised collar and orange lower jacket.
      const yoke=new THREE.LatheGeometry([.309,.375,.41,.415,.422].map(y=>new THREE.Vector2(torsoRadius(y)+.0035,y)),24);
      mesh(outfit,yoke,dark).scale.z=.65;
      mesh(outfit,new THREE.CylinderGeometry(0.067,0.08,0.068,16,1,true),dark,0,0.43,0);
      clothStroke(steel,[[0,.082],[0,.399]],.006,false,.005);
      box(outfit,[0.019,0.025,0.017],ink,0,0.355,-0.115);
      band(dark,.071,.025);
      // A complete round red patch with an inset whirl; no Leaf-style antenna on the back.
      clothDisk(ink,.066,0,.307,true,.005);
      clothDisk(accent,.062,0,.307,true,.0065);
      clothStroke(ink,uzumakiWhorl().map(([x,y])=>[x*.062,.307+y*.062] as const),.009,true,.008,1);
      box(outfit,[0.074,0.082,0.038],material(0x8c7860),0.106,0.117,0.09);
    }
    if(id==='kick') {
      mesh(group,stuntHelmetGeometry(),shell);
      const rimPoints=Array.from({length:48},(_,i)=>stuntHelmetRim(i/48*Math.PI*2));
      mesh(group,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPoints,true),48,.0035,6,true),ink);
      mesh(group,stuntHelmetGeometry(true),accent);
      for(const side of [-1,1])oval(group,ink,side*.137,-.007,.015,.003,.012,.012);
      clothMark(accent,[[-.008,.096],[.008,.096],[.008,.398],[-.008,.398]]);
      band(accent,.077,.020);
      mesh(outfit,new THREE.CylinderGeometry(.065,.075,.038,16,1,true),shirt,0,.427,0);
      for(const side of [-1,1])clothMark(accent,[[side*.012,.413],[side*.062,.416],[side*.035,.376]]);
    }
    if(cartoon)addCartoonOutfit(outfit,id,clothSurface(false));
    if(human)addHumanOutfit(outfit,id,clothSurface(false));
    if(id==='peter')addPeterOutfit(outfit,clothSurface(false),width,depth);
    if(anime)addAnimeGuestOutfit(outfit,id,clothSurface(false),clothSurface(true));
    if(id==='spiderman')addSpiderOutfit(outfit,clothSurface(false),clothSurface(true));
    if(id==='mj')addMichaelOutfit(outfit,clothSurface(false),clothSurface(true));
    if(id==='kick')group.scale.setScalar(1.4);
    batchCosmetics(group);batchCosmetics(outfit);
    // Colors are baked into the geometry; these temporary authoring materials never reach the GPU.
    const mats=new Set<THREE.Material>();for(const mat of [skin,hair,accent,shell,ink,white,steel,shirt,dark])mats.add(mat);
    mats.forEach(mat=>mat.dispose());
  }
}

/** Cuffs and suit details inherit bone scaling, without adding joints or changing reach. */
export function addCharacterLimbDetails(parent:THREE.Mesh,kind:'upperarm'|'forearm'|'shin'|'thigh',side=1) {
  if(kind==='thigh'){addCartoonShorts(parent);addSasukeShorts(parent);return;}
  for(const {id} of CHARACTERS) {
    const p=characterPalette(id,'skate'),group=look(parent,id,kind),accent=material(p.accent),ink=material(0x202633),white=material(0xf1ecdc);
    if(id==='finn'||id==='bart'){addCartoonLimbDetails(group,id,kind);batchCosmetics(group);continue;}
    if(id==='shaggy'||id==='light'){addHumanLimbDetails(group,id,kind);batchCosmetics(group);continue;}
    if(id==='peter'){addPeterLimbDetails(group,kind);batchCosmetics(group);continue;}
    if(id==='sasuke'||id==='onizuka'){addAnimeGuestLimb(group,id,kind,side);batchCosmetics(group);continue;}
    if(id==='spiderman'){addSpiderLimb(group,kind,side);batchCosmetics(group);continue;}
    if(id==='mj'){addMichaelLimb(group,kind,side);batchCosmetics(group);continue;}
    if(kind==='upperarm') {
      if(id==='kick')box(group,[0.006,0.9,0.022],accent,side*.045,0,0);
      if(id==='goku') {
        // Low relief along the existing arm gives a biceps/triceps contour without moving the elbow.
        oval(group,material(p.skin),0,-.02,-.013,.043,.30,.041);
        oval(group,material(p.skin),0,-.12,.011,.041,.25,.037);
        // The gi is open at the shoulders; only the blue undershirt reaches onto the upper arm.
        mesh(group,new THREE.LatheGeometry([[-.5,.047],[-.46,.05],[-.3,.047],[-.25,.044]].map(([y,r])=>new THREE.Vector2(r!,y!)),12),accent);
        mesh(group,new THREE.LatheGeometry([[-.5,.052],[-.465,.054],[-.38,.052]].map(([y,r])=>new THREE.Vector2(r!,y!)),12),material(p.shirt));
      }
    } else if(kind==='forearm') {
      if(id==='goku')oval(group,material(p.skin),0,-.18,-.004,.031,.27,.031);
      const {radiusBottom,radiusTop}=parent.geometry.userData as {radiusBottom:number;radiusTop:number};
      const radius=(radiusBottom+radiusTop)/2;
      mesh(group,new THREE.CylinderGeometry(radius+0.003,radius+0.004,0.2,10),id==='naruto'?ink:id==='kick'?material(p.gloves):accent,0,0.31,0);
      if(id==='kick')box(group,[0.006,0.70,0.021],accent,side*(radius+.003),-.05,0);
    } else {
      if(id==='goku') {
        mesh(group,new THREE.CylinderGeometry(0.059,0.051,0.58,12),accent,0,0.14,0);
        for(const y of [-0.03,0.28])mesh(group,new THREE.CylinderGeometry(0.064,0.064,0.025,12),material(0xd09a3b),0,y,0);
        box(group,[0.018,0.56,0.009],material(0xc7462e),0,0.14,-0.062);
      }
      if(id==='naruto') {
        for(const y of [-0.14,-0.06,0.02,0.10])mesh(group,new THREE.CylinderGeometry(0.055,0.055,0.065,10),white,0,y,0);
        mesh(group,new THREE.CylinderGeometry(0.06,0.055,0.19,10),ink,0,0.37,0);
      }
      if(id==='kick')mesh(group,new THREE.CylinderGeometry(.06,.056,.34,12),material(p.shoes),0,.32,0);
      if(id==='boy' || id==='girl') {
        box(group,[0.023,0.11,0.009],accent,0,0.1,-0.049);
        mesh(group,new THREE.CylinderGeometry(0.047,0.047,0.05,10),ink,0,0.4,0);
      }
    }
    batchCosmetics(group);
  }
}

/** The suit's rounded seat belongs to the pelvis, so it follows hips and crash motion together. */
export function addCharacterHipDetails(hips:THREE.Group) {
  const group=new THREE.Group();hips.add(group);
  const kick=look(group,'kick','hips'),cloth=material(characterPalette('kick','skate').pants);
  for(const side of [-1,1])mesh(kick,new THREE.SphereGeometry(1,16,12),cloth,side*.075,-.005,.075).scale.set(.126,.116,.112);
  batchCosmetics(kick);cloth.dispose();return group;
}

/** Details on the existing planted shoe groups follow every kick and grab. */
export function addCharacterShoeDetails(foot:THREE.Group) {
  for(const {id} of CHARACTERS) {
    const p=characterPalette(id,'skate'),group=look(foot,id,'shoe'),accent=material(p.accent),dark=material(p.shoes),white=material(0xece4cc);
    if(id==='finn'||id==='bart'){addCartoonShoeDetails(group,id);batchCosmetics(group);continue;}
    if(id==='shaggy'||id==='light'){addHumanShoeDetails(group,id);batchCosmetics(group);continue;}
    if(id==='peter'){addPeterShoeDetails(group);batchCosmetics(group);continue;}
    if(id==='sasuke'||id==='onizuka'){addAnimeGuestShoe(group,id);batchCosmetics(group);continue;}
    if(id==='spiderman'){addSpiderShoe(group);batchCosmetics(group);continue;}
    if(id==='mj'){addMichaelShoe(group);batchCosmetics(group);continue;}
    for(const side of [-1,1])box(group,[0.006,0.016,0.11],id==='goku'?accent:white,side*0.054,0.027,-0.015).rotation.x=0.1;
    box(group,[0.07,0.045,0.016],dark,0,0.028,0.081);
    if(id==='kick')box(group,[0.04,0.019,0.18],accent,0,0.06,-0.02);
    if(id==='naruto') {
      const toes=new THREE.Group();toes.userData.rideSkin='skate';group.add(toes);
      box(toes,[0.092,0.028,0.053],material(p.skin),0,0.031,-0.103);
      for(const x of [-0.03,-0.01,0.01,0.03])box(toes,[0.002,0.012,0.02],dark,x,0.046,-0.119);
      batchCosmetics(toes);
    }
    batchCosmetics(group);
  }
}
