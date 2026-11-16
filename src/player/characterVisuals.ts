import * as THREE from 'three';
import {CHARACTERS} from '../characters.ts';
import type {CharacterId} from '../characters.ts';

type Materials={skin:THREE.Material;helmet:THREE.Material;hair:THREE.Material;ink:THREE.Material;accent:THREE.Material;white:THREE.Material;steel:THREE.Material};
type Batch=(group:THREE.Group)=>void;

/** Character details attach to the existing head/chest; all joint targets remain shared. */
export function addCharacterLooks(head:THREE.Group,torso:THREE.Group,materials:Materials,batch:Batch) {
  const {skin,helmet,hair,ink,accent,white,steel}=materials;
  const faceGeometry=new THREE.SphereGeometry(0.095,16,12),earGeometry=new THREE.SphereGeometry(0.018,8,6);
  const hairCap=new THREE.SphereGeometry(0.101,12,8,0,Math.PI*2,0,Math.PI*0.6);
  const helmetCap=new THREE.SphereGeometry(0.106,18,12,0,Math.PI*2,0,Math.PI*0.58);
  const spike=new THREE.ConeGeometry(1,1,4),circle=new THREE.CircleGeometry(1,16);
  function mesh(parent:THREE.Object3D,geometry:THREE.BufferGeometry,material:THREE.Material,x=0,y=0,z=0) {
    const object=new THREE.Mesh(geometry,material);object.position.set(x,y,z);object.castShadow=true;parent.add(object);return object;
  }
  function box(parent:THREE.Object3D,size:number[],material:THREE.Material,x=0,y=0,z=0) {
    return mesh(parent,new THREE.BoxGeometry(size[0],size[1],size[2]),material,x,y,z);
  }
  function look(parent:THREE.Object3D,character:CharacterId,kind:string) {
    const group=new THREE.Group();group.userData.characterSkin=character;group.name=`${kind}-${character}`;parent.add(group);return group;
  }
  for(const {id} of CHARACTERS) {
    const group=look(head,id,'character-head');
    mesh(group,faceGeometry,skin).scale.set(0.87,1.13,0.95);
    for(const side of [-1,1])mesh(group,earGeometry,skin,side*0.09,0,0);
    mesh(group,new THREE.SphereGeometry(0.017,8,6),skin,0,-0.019,-0.091);
    if(id==='boy' || id==='girl' || id==='kick') {
      mesh(group,helmetCap,helmet,0,0.035,0);
      if(id!=='kick')box(group,[0.15,0.014,0.08],helmet,0,0.045,-0.085);
      for(const x of [-0.037,0.037])box(group,[0.044,0.027,0.014],ink,x,0.008,-0.085);
      box(group,[0.03,0.008,0.014],ink,0,0.01,-0.09);
    } else {
      mesh(group,hairCap,hair,0,0.025,0);
      const count=id==='goku'?7:9;
      for(let i=0;i<count;i++) {
        const angle=i/count*Math.PI*2,x=Math.cos(angle)*0.075,z=Math.sin(angle)*0.066;
        const tuft=mesh(group,spike,hair,x,0.105+(i%2)*0.014,z);
        const size=id==='goku'?0.045:0.032;tuft.scale.set(size,id==='goku'?0.14:0.085,size);
        const direction=new THREE.Vector3(Math.cos(angle)*(id==='goku'?0.8:0.55),1,Math.sin(angle)*0.5).normalize();
        tuft.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
      }
      for(const side of [-1,1])box(group,[0.029,0.009,0.009],ink,side*0.034,0.003,-0.09);
    }
    if(id==='girl') {
      const ponytail=mesh(group,new THREE.CapsuleGeometry(0.027,0.11,3,8),hair,0,-0.035,0.12);
      ponytail.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(0,-0.8,0.6));
      box(group,[0.055,0.018,0.045],accent,0,0.025,0.107);
      for(const side of [-1,1])box(group,[0.018,0.09,0.035],hair,side*0.08,-0.015,0.025);
    }
    if(id==='naruto') {
      mesh(group,new THREE.CylinderGeometry(0.102,0.102,0.035,12,1,true),ink,0,0.025,0);
      box(group,[0.085,0.029,0.013],steel,0,0.025,-0.103);
      const symbol=mesh(group,new THREE.TorusGeometry(0.008,0.002,4,10),ink,0,0.025,-0.111);symbol.rotation.y=Math.PI;
      for(const side of [-1,1])box(group,[0.014,0.09,0.009],ink,side*0.024,-0.027,0.105).rotation.z=side*0.3;
    }
    if(id==='kick') {
      for(const phi of [Math.PI/2,Math.PI*1.5])mesh(group,new THREE.SphereGeometry(0.1085,4,10,phi-0.12,0.24,0,Math.PI*0.58),accent,0,0.035,0);
      box(group,[0.11,0.019,0.04],helmet,0,-0.069,-0.077);
    }
    batch(group);
  }
  const costumes=new THREE.Group();costumes.userData.characterAttachment=true;torso.add(costumes);
  for(const {id} of CHARACTERS) {
    const group=look(costumes,id,'character-outfit');
    if(id==='boy')box(group,[0.085,0.06,0.008],white,-0.065,0.29,-0.105);
    if(id==='girl') {
      box(group,[0.014,0.24,0.01],accent,0,0.23,-0.107);
      for(const side of [-1,1])box(group,[0.065,0.025,0.012],white,side*0.075,0.31,-0.097).rotation.z=side*0.25;
    }
    if(id==='goku') {
      box(group,[0.27,0.035,0.18],accent,0,0.075,0);
      for(const side of [-1,1])box(group,[0.1,0.022,0.012],accent,side*0.035,0.36,-0.101).rotation.z=side*0.55;
      mesh(group,circle,white,0,0.27,0.111).scale.setScalar(0.058);
      box(group,[0.012,0.06,0.004],ink,0,0.27,0.114);
      for(const y of [0.25,0.28])box(group,[0.043,0.009,0.004],ink,0,y,0.114);
    }
    if(id==='naruto') {
      box(group,[0.25,0.065,0.04],ink,0,0.37,-0.084);
      box(group,[0.012,0.24,0.012],ink,0,0.23,-0.107);
      mesh(group,new THREE.TorusGeometry(0.042,0.008,4,14),accent,0,0.26,0.112);
      box(group,[0.025,0.008,0.005],accent,0.017,0.26,0.121);
    }
    if(id==='kick') {
      for(const side of [-1,1])box(group,[0.027,0.31,0.01],accent,0,0.25,side*0.107);
      box(group,[0.27,0.025,0.17],accent,0,0.075,0);
    }
    batch(group);
  }
}

/** The stripes inherit each arm segment's rotation and length. */
export function addStuntStripe(segment:THREE.Mesh,material:THREE.Material) {
  const {radiusTop,radiusBottom}=(segment.geometry as THREE.CylinderGeometry).parameters;
  const positions:number[]=[];
  for(const y of [-0.37,0.37])for(const x of [-0.006,0.006]) {
    const radius=(radiusTop+radiusBottom)/2+y*(radiusTop-radiusBottom);
    positions.push(x,y,-radius-0.0015);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex([0,2,1,1,2,3]);geometry.computeVertexNormals();
  const stripe=new THREE.Mesh(geometry,material);
  stripe.castShadow=true;stripe.userData.characterSkin='kick';segment.add(stripe);
}
