import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {croppedHairGeometry,sweptLockGeometry} from '../geometry.ts';
import {refinedFaceSurface} from '../faces/refinedFaceArtwork.ts';
import {hiddenLeafStrokes} from '../insignia.ts';
import {batchCosmetics} from '../cosmetics.ts';
import {cosmeticMesh as mesh,cosmeticOval as oval,projectedPatch as patch,projectedLine as stroke,addGuestFace} from '../primitives.ts';
import type {Point3} from '../primitives.ts';

export type AnimeGuest='sasuke'|'onizuka';
const COLORS={sasuke:{skin:0xe7c09c,hair:0x1c202d,shirt:0x20345c},onizuka:{skin:0xcd946f,hair:0xe5bd45,shirt:0xf3f1e5}};
export function addAnimeGuestHead(parent:THREE.Group,id:AnimeGuest) {
  const p=COLORS[id];addGuestFace(parent,id,p.skin);
  mesh(parent,croppedHairGeometry(id),id==='onizuka'?0xb69b50:p.hair);
  const lock=(a:Point3,b:Point3,c:Point3,width:number,depth:number,color=p.hair)=>mesh(parent,sweptLockGeometry(a,b,c,width,depth,6,8),color);
  if(id==='sasuke') {
    const band=mesh(parent,new THREE.CylinderGeometry(.097,.097,.034,32,1,true),p.shirt,0,.052,0);
    band.scale.set(1.03,1,.90);
    const forehead=(x:number)=>-.088*Math.sqrt(Math.max(.05,1-(x/.104)**2));
    patch(parent,0xa9bdc8,[[-.046,.036],[.046,.036],[.051,.040],[.051,.064],[.046,.068],[-.046,.068],[-.051,.064],[-.051,.040]],forehead,false,.001,2);
    for(const mark of hiddenLeafStrokes())stroke(parent,0x252936,mark.points.map(([x,y])=>[-x*.015,.052+y*.015] as const),forehead,mark.width*.015,false,.0025);
    for(const side of [-1,1]) {
      for(const y of [.042,.052,.062])oval(parent,0x343b48,[side*.042,y,forehead(side*.042)-.003],[.0015,.0015,.001]);
      lock([side*.057,.101,-.040],[side*.099,.025,-.077],[side*.079,-.084,-.044],.053,.027);
      lock([side*.025,.112,-.051],[side*.043,.086,-.092],[side*.060,.064,-.101],.048,.022);
      lock([side*.052,.066,.063],[side*.110,.070,.125],[side*.143,.074,.165],.035,.055);
      lock([side*.042,.041,.079],[side*.093,.038,.150],[side*.112,.025,.190],.033,.050);
      lock([side*.032,.017,.075],[side*.062,-.005,.134],[side*.075,-.040,.165],.030,.046);
    }
    lock([0,.086,.067],[0,.108,.135],[0,.113,.195],.065,.020);
    lock([0,.027,.085],[.005,.042,.143],[.012,.026,.185],.080,.037);
    // Opaque iris patches sit in front of the decal too, so active Sharingan survives artwork loading.
    const eyeSurface=(x:number,y:number)=>refinedFaceSurface(x,y,'sasuke');
    for(const side of [-1,1]) {
      const x=side<0?-.0363:.03555,y=-.013;
      const disk=(color:number,cx:number,cy:number,rx:number,ry:number,offset:number)=>patch(parent,color,
        Array.from({length:16},(_,i)=>[cx+Math.cos(i/16*Math.PI*2)*rx,cy+Math.sin(i/16*Math.PI*2)*ry] as const),eyeSurface,false,offset,1);
      disk(0x241b23,x,y,.0088,.0072,.0055);disk(0xbb202d,x,y,.0077,.0064,.0060);
      disk(0x171a23,x,y,.0026,.0029,.0065);
      for(let i=0;i<3;i++) {
        const a=i/3*Math.PI*2-Math.PI/2,cx=x+Math.cos(a)*.0048,cy=y+Math.sin(a)*.0045;
        disk(0x171a23,cx,cy,.00095,.0012,.0067);
        stroke(parent,0x171a23,[[cx,cy],[cx+Math.cos(a+.9)*.0015,cy+Math.sin(a+.9)*.0015]],eyeSurface,.0008,false,.0068);
      }
    }
  } else {
    // A low bleached crop with a darker fade, rather than a tall anime spike fan.
    const crown=croppedHairGeometry('onizuka'),vertices=crown.getAttribute('position'),source=crown.index!,indices:number[]=[];
    for(let i=0;i<source.count;i+=3)if((vertices.getY(source.getX(i))+vertices.getY(source.getX(i+1))+vertices.getY(source.getX(i+2)))/3>.066)
      indices.push(source.getX(i),source.getX(i+1),source.getX(i+2));
    crown.setIndex(indices);
    for(let i=0;i<vertices.count;i++){vertices.setX(i,vertices.getX(i)*1.012);vertices.setZ(i,(vertices.getZ(i)-.005)*1.012+.005);vertices.setY(i,vertices.getY(i)+.001);}
    crown.computeVertexNormals();mesh(parent,crown,p.hair);
    for(let ring=0;ring<2;ring++)for(let i=0;i<9;i++) {
      const a=i/9*Math.PI*2+(ring?.20:0),r=ring?.030:.066;
      const x=Math.sin(a)*r,z=.008+Math.cos(a)*r*.85,y=ring?.113:.094;
      lock([x,y-.012,z],[x*1.03,Math.min(.125,y+.006),z],[x*1.05+.004,Math.min(.129,y+.017+(i%3)*.002),z-.004],.017,.012);
    }
    for(const side of [-1,1]) {
      mesh(parent,new THREE.CapsuleGeometry(.007,.021,2,6),0x544333,side*.087,-.009,-.003);
      oval(parent,0xbda04e,[side*.085,.061,.004],[.011,.025,.045]);
    }
  }
  parent.scale.setScalar(id==='sasuke'?1.11:1.12);
}

export function addAnimeGuestOutfit(parent:THREE.Group,id:AnimeGuest,front:(x:number,y:number)=>number,back:(x:number,y:number)=>number) {
  if(id==='sasuke') {
    const collar=new THREE.CylinderGeometry(.075,.089,.082,24,1,true),rim=new THREE.CylinderGeometry(.076,.076,.008,24,1,true);
    for(const [geometry,edge] of [[collar,false],[rim,true]] as const) {
      const p=geometry.getAttribute('position');
      for(let i=0;i<p.count;i++) {
        const front=THREE.MathUtils.smoothstep(-p.getZ(i)/Math.hypot(p.getX(i),p.getZ(i)),.25,.85);
        const weight=edge?1:(p.getY(i)+.041)/.082;
        p.setY(i,p.getY(i)-.055*front*weight);
      }
      geometry.computeVertexNormals();
    }
    mesh(parent,collar,0x20345c,0,.434,0).scale.z=.82;
    mesh(parent,rim,0x1c2c52,0,.475,0).scale.z=.82;
    const circle=(r:number,start=0,end=Math.PI*2)=>Array.from({length:33},(_,i)=>[Math.cos(start+(end-start)*i/32)*r,.294+Math.sin(start+(end-start)*i/32)*r] as const);
    patch(parent,0x171f32,circle(.061),back,true,.004);
    patch(parent,0xf4f0e8,circle(.056),back,true,.0055);
    patch(parent,0xbb3c43,[[0,.294],...circle(.056,0,Math.PI)],back,true,.007);
    patch(parent,0xf4f0e8,[[-.008,.241],[.008,.241],[.008,.214],[-.008,.214]],back,true,.006);
    mesh(parent,new RoundedBoxGeometry(.064,.067,.035,1,.006),0x847768,.119,.111,.088);
  } else {
    patch(parent,0xcd946f,[[-.068,.422],[.068,.422],[.045,.343],[.014,.300],[-.032,.324]],front,false,.003);
    for(const side of [-1,1]) {
      patch(parent,0xcbd0c8,[[side*.072,.421],[side*.114,.391],[side*.067,.341],[side*.020,.386]],front,false,.005);
      patch(parent,0xf3f1e5,[[side*.070,.415],[side*.104,.390],[side*.066,.350],[side*.027,.386]],front,false,.0065);
      stroke(parent,0xd0d3cb,[[side*.024,.312],[side*.012,.210],[side*.009,.085]],front,.002);
      stroke(parent,0xd0d3cb,[[side*.121,.180],[side*.086,.137]],front,.0015);
    }
    stroke(parent,0xb9906e,[[-.034,.359],[0,.346],[.028,.360]],front,.0015,false,.005);
    stroke(parent,0xb9906e,[[0,.343],[0,.316]],front,.0013,false,.005);
    for(const y of [.142,.209,.278])oval(parent,0x7c847f,[.012,y,front(.012,y)-.005],[.0035,.0035,.002]);
    mesh(parent,new THREE.CylinderGeometry(.143,.143,.021,24,1,true),0x292c30,0,.065,0).scale.set(1.16,1,.72);
    mesh(parent,new RoundedBoxGeometry(.035,.023,.008,1,.002),0x9babb0,0,.064,front(0,.065)-.006);
    stroke(parent,0xd0d3cb,[[-.066,.308],[-.115,.306],[-.115,.267],[-.085,.254],[-.066,.268]],front,.0015);
  }
}

export function addSasukeShorts(parent:THREE.Mesh) {
  const group=new THREE.Group();group.name='character-thigh-sasuke';group.userData.characterSkin='sasuke';parent.add(group);
  mesh(group,new THREE.LatheGeometry([[-.5,.087],[-.3,.095],[.1,.091],[.48,.087],[.52,.085]].map(([y,r])=>new THREE.Vector2(r!,y!)),16),0xf4f1e8);
  mesh(group,new THREE.CylinderGeometry(.088,.086,.04,16,1,true),0xd7d9d1,0,.49,0);batchCosmetics(group);
}

export function addAnimeGuestLimb(parent:THREE.Group,id:AnimeGuest,kind:'upperarm'|'forearm'|'shin',side:number) {
  if(id==='sasuke') {
    if(kind==='forearm'||kind==='shin') {
      const radius=kind==='forearm'?.035:.041,start=kind==='forearm'?-.08:.02;
      mesh(parent,new THREE.CylinderGeometry(radius,radius,.48-start,12,1,true),0xf2f0e6,0,(.48+start)/2,0);
      for(let y=start+.05;y<.46;y+=.12)mesh(parent,new THREE.CylinderGeometry(radius+.0007,radius+.0007,.016,12,1,true),0xd2d8d3,0,y,0);
    }
  } else if(kind==='upperarm') {
    mesh(parent,new THREE.LatheGeometry([[-.5,.048],[-.25,.050],[.2,.047],[.44,.044]].map(([y,r])=>new THREE.Vector2(r!,y!)),12),0xf3f1e5);
    mesh(parent,new THREE.CylinderGeometry(.051,.050,.12,12,1,true),0xe3e6dd,0,.39,0);
  } else if(kind==='forearm'&&side===-1) {
    mesh(parent,new THREE.CylinderGeometry(.028,.029,.11,12,1,true),0x292e33,0,.30,0);
    mesh(parent,new THREE.CylinderGeometry(.017,.017,.007,16),0xb2c2c8,0,.30,-.030).rotation.x=Math.PI/2;
    mesh(parent,new THREE.CylinderGeometry(.012,.012,.008,16),0x34434a,0,.30,-.035).rotation.x=Math.PI/2;
  }
}

export function addAnimeGuestShoe(parent:THREE.Group,id:AnimeGuest) {
  mesh(parent,new RoundedBoxGeometry(.104,.028,.159,2,.009),id==='sasuke'?0x243556:0x72523c,0,.054,-.021);
  if(id==='sasuke') {
    const toes=new THREE.Group();toes.userData.rideSkin='skate';parent.add(toes);
    mesh(toes,new RoundedBoxGeometry(.093,.025,.050,1,.007),0xe7c09c,0,.033,-.103);
    for(const x of [-.031,-.010,.011,.031])mesh(toes,new THREE.BoxGeometry(.0018,.008,.020),0x9b7761,x,.047,-.116);
    batchCosmetics(toes);
  }
}
