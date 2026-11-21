import * as THREE from 'three';
import {box,post,part,unitCylinder,metal,white,dark,wood,leaf,blossom,glass} from './parts.ts';
import {makeShopSign} from './city.ts';

type BuildingSize={width:number;depth:number;height:number};
/** Small attached details share the existing primitive/material pools. Large roof equipment remains solid. */
export function addDistrictBuildingDetails(root:THREE.Group,kind:string,{width:w,depth:d,height:h}:BuildingSize) {
  const trim=new THREE.Group();trim.name='district-building-details';trim.userData.collision=false;root.add(trim);
  const panel=(size:number[],at:number[],material:THREE.Material=metal)=>box(trim,size,at,material);
  const sign=(choice:number,y:number,z:number,width=w*.6)=>{
    panel([width+.3,.95,.09],[0,y,z],white);
    const label=makeShopSign(choice,width);label.position.set(0,y,z+.10);trim.add(label);
  };
  const shutters=(x:number,y:number,z:number,width:number,height:number)=>{
    for(const side of [-1,1]) {
      const sx=x+side*(width/2+.24);panel([.32,height+.08,.10],[sx,y,z],wood);
      for(const offset of [-.25,.25])panel([.34,.04,.13],[sx,y+offset*height,z+.045],white);
    }
  };
  if(kind==='boathouse') {
    for(const side of [-1,1]) {
      panel([w+.35,.12,.15],[0,h-.12,side*(d/2+.18)]);
      panel([.12,h-.25,.12],[side*(w/2+.10),(h-.25)/2,d/2+.18]);
      for(const z of [-d*.28,d*.28])panel([.12,h-.4,.13],[side*(w/2+.06),(h-.4)/2,z],white);
    }
    sign(1,h-.8,d/2+.23,w*.38);
    for(const x of [-w*.27,w*.27])panel([.35,.14,.16],[x,2.4,d/2+.16],white);
  } else if(kind==='terminal') {
    for(const x of [-8.1,-2.8,2.8,8.1])panel([.12,4.45,.13],[x,3.2,d/2+.13],white);
    sign(15,5.7,d/2+.13,8.6);
    box(root,[2.5,.2,2.2],[5,h+.34,-2],metal);
    box(root,[2.2,.85,1.9],[5,h+.86,-2],white);
    for(const x of [4.45,5,5.55])panel([.12,.06,1.55],[x,h+1.32,-2],dark);
    for(const y of [9.6,13.9])panel([5.6,.13,5.6],[-5.2,y,0]);
    for(const x of [-6.4,-4])panel([.09,2.4,.13],[x,11.7,2.91],white);
  } else if(kind==='adobe') {
    for(const x of [-w*.3,w*.3])shutters(x,2.7,d/2+.12,1.35,1.8);
    for(const x of [-w*.33,w*.33]) {
      panel([1.65,.35,.65],[x,.35,d/2+.4],wood);panel([1.35,.28,.5],[x,.58,d/2+.4],leaf);
    }
    box(root,[1.5,.18,1.5],[w*.32,h+.29,-d*.25],metal);
    post(root,1.1,1.2,[w*.32,h+.96,-d*.25],white);
    box(root,[1.2,.13,1.2],[w*.32,h+1.61,-d*.25],metal);
    for(const x of [-w*.35,-w*.1,w*.15,w*.4])panel([.18,.18,.45],[x,h-.25,d/2+.2],wood);
  } else if(kind==='service-station') {
    sign(2,3.6,-.16,8.8);
    for(const x of [-4.7,0,4.7])panel([.11,2.7,.14],[x-1.8,2.2,-.18],white);
    for(const x of [-3.8,3.8]) {
      panel([.34,.16,.09],[x,1.12,4.23],glass);
      panel([.055,.8,.055],[x+.5,.7,3.85],dark);
    }
    for(const x of [-4,4])panel([2.6,.04,.45],[x,4.43,3.4],white);
    panel([3.5,.09,2.4],[4,4.58,-4],metal);
  } else if(kind==='courtyard') {
    for(const x of [-5.2,5.2]) {
      shutters(x,2.8,6.13,2.4,2.1);
      panel([2.6,.25,.55],[x,1.55,6.3],wood);panel([2.3,.28,.42],[x,1.77,6.3],blossom);
    }
    for(const z of [3.4,4.1,4.8,5.5])panel([7.3,.1,.12],[0,3.64,z],wood);
    for(const x of [-2.4,2.4])panel([.12,3.3,.14],[x,1.65,-2.38],wood);
  } else if(kind==='conservatory') {
    // Read the dome's actual meridian edges so the ribs follow its faceted surface exactly.
    const dome=root.children.find(o=>o instanceof THREE.Mesh&&o.geometry.type==='SphereGeometry') as THREE.Mesh|undefined;
    if(dome) {
      dome.updateMatrix();const vertices=dome.geometry.getAttribute('position');
      for(const meridian of [0,3,6,9])for(let ring=0;ring<5;ring++) {
        const p=new THREE.Vector3().fromBufferAttribute(vertices,ring*13+meridian).applyMatrix4(dome.matrix);
        const q=new THREE.Vector3().fromBufferAttribute(vertices,(ring+1)*13+meridian).applyMatrix4(dome.matrix);
        p.y+=.025;q.y+=.025;
        const rib=panel([.075,p.distanceTo(q),.075],p.clone().lerp(q,.5).toArray());
        rib.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),q.sub(p).normalize());
      }
    }
    for(const x of [-4.7,4.7]) {
      panel([2.4,.4,.75],[x,.65,6.3],white);panel([2.1,.35,.58],[x,1.01,6.3],leaf);
    }
  } else if(kind==='lodge') {
    for(const x of [-4.5,0,4.5])shutters(x,5.2,6.13,2.7,1.7);
    panel([14.3,.25,.15],[0,2.45,6.13],wood);
    for(const x of [-6.6,6.6])panel([.22,7.25,.18],[x,3.7,6.16],wood);
    for(const x of [-4.5,4.5]) {
      panel([2.8,.28,.65],[x,4.04,8.15],wood);panel([2.55,.28,.48],[x,4.27,8.15],blossom);
    }
    box(root,[1.65,.2,1.85],[-4,11.56,-2],metal);
  } else if(kind==='lift-station') {
    sign(5,3.5,4.2,6.5);
    for(const x of [-5,5]) {
      panel([.06,.06,8],[x,13.7,0],dark);
      for(const dy of [-.65,.65]) {
        const spoke=part(trim,unitCylinder,[.09,2.05,.09],[x,13.4,-1],white);spoke.rotation.x=dy;
      }
    }
    panel([.14,2.1,.14],[0,11.8,1],metal);panel([2.7,.16,1.2],[0,10.7,1],wood);
    panel([2.7,.8,.12],[0,11.1,.45],wood);
  }
}
