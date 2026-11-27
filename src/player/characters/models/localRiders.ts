import * as THREE from 'three';
import {characterPalette,characterProportions} from '../catalog.ts';
import {batchCosmetics} from '../cosmetics.ts';
import {headSurface,surfacePatch,sweptLockGeometry,torsoRadius,torsoCenter} from '../geometry.ts';
import {addPonytail} from '../hair.ts';

export type ClassicRider='boy'|'girl';

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


/** Local rider model builders, isolated from shared rig assembly. */
export function addClassicLook(group:THREE.Group,outfit:THREE.Group,id:ClassicRider) {
  const p=characterPalette(id,'skate'),skin=material(p.skin),hair=material(p.hair),accent=material(p.accent),shell=material(p.helmet);
  const ink=material(0x18202c),white=material(0xf7f3df),steel=material(0xa6bdc8),shirt=material(p.shirt),dark=material(p.sleeves);
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

  const faceSurface=(x:number,y:number)=>headSurface(x,y,id);
  const faceMark=(mat:THREE.Material,points:readonly(readonly[number,number])[],offset=0.0012)=>mesh(group,surfacePatch(points,faceSurface,false,offset),mat);
  for(const side of [-1,1]) {
    oval(group,skin,side*0.086,-0.005,0,0.017,0.025,0.015);
    oval(group,material(0xb87863),side*0.098,-0.005,-0.001,0.003,0.013,0.008);
    {
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
  {
    const noseZ=headSurface(0,-.025,id)-.003;
    oval(group,skin,0,-.025,noseZ,.011,.019,.014);
    for(const side of [-1,1])oval(group,material(0x9a6150),side*.005,-.033,noseZ-.011,.0025,.0016,.002);
    faceMark(material(0x713d35),[[-.019,-.058],[-.008,-.061],[.008,-.061],[.019,-.058],[.016,-.063],[0,-.066],[-.016,-.063]],.0018);
    faceMark(material(0xaf6d5c),[[-.011,-.067],[.011,-.067],[.008,-.069],[-.008,-.069]],.0015);
  }
  {
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
  // Dispose temporary authoring materials after the assembler has baked vertex colours.
  return ()=>{for(const mat of new Set([skin,hair,accent,shell,ink,white,steel,shirt,dark]))mat.dispose();};
}

export function addClassicLimb(parent:THREE.Mesh,group:THREE.Group,id:ClassicRider,kind:'upperarm'|'forearm'|'shin') {
  const p=characterPalette(id,'skate'),accent=material(p.accent),ink=material(0x202633);
  if(kind==='forearm') {
    const {radiusBottom,radiusTop}=parent.geometry.userData;
    const radius=(radiusBottom+radiusTop)/2;
    mesh(group,new THREE.CylinderGeometry(radius+.003,radius+.004,.2,10),accent,0,.31,0);
  } else if(kind==='shin') {
    box(group,[.023,.11,.009],accent,0,.1,-.049);
    mesh(group,new THREE.CylinderGeometry(.047,.047,.05,10),ink,0,.4,0);
  }
}
export function addClassicShoe(group:THREE.Group,id:ClassicRider) {
  const p=characterPalette(id,'skate'),dark=material(p.shoes),white=material(0xece4cc);
  for(const side of [-1,1])box(group,[0.006,0.016,0.11],white,side*0.054,0.027,-0.015).rotation.x=0.1;
  box(group,[0.07,0.045,0.016],dark,0,0.028,0.081);
 }
