import * as THREE from 'three';

export const START_PLATFORM={height:17,width:7,back:-4,front:10,
  /** Allow a full ollie off the introductory drop while keeping later hard landings unchanged. */
  landingSpeed:28,
} as const;
// World-unit target velocity preserves the established boost strength after display calibration.
export const START_BOOST={along:42,length:36,width:2.8,x:4.8,speed:53.6448} as const;
const top=new THREE.MeshStandardMaterial({color:0x29343f,roughness:0.95});
const frame=new THREE.MeshStandardMaterial({color:0xe5683e,roughness:0.65,metalness:0.15});
const paint=new THREE.MeshStandardMaterial({color:0xffd35a,roughness:0.6});
const boostPaint=new THREE.MeshStandardMaterial({color:0xb5f542,roughness:0.75,emissive:0xb5f542,emissiveIntensity:0.06});
boostPaint.userData.surface='obstacle';boostPaint.polygonOffset=true;boostPaint.polygonOffsetFactor=-1;boostPaint.polygonOffsetUnits=-2;
const arrowShape=new THREE.Shape();
arrowShape.moveTo(0,0.75);arrowShape.lineTo(-0.5,0);arrowShape.lineTo(-0.17,0);
arrowShape.lineTo(-0.17,-0.65);arrowShape.lineTo(0.17,-0.65);arrowShape.lineTo(0.17,0);
arrowShape.lineTo(0.5,0);arrowShape.closePath();
// Positive shape Y becomes downhill (-Z), so the solid arrow head points at the open lip.
const arrowGeometry=new THREE.ShapeGeometry(arrowShape).rotateX(-Math.PI/2);
arrowGeometry.userData.shared=true;
function arrow(material:THREE.Material) {
  const mesh=new THREE.Mesh(arrowGeometry,material);mesh.userData.collision=false;return mesh;
}

/** A floating runway parallel to the opening hill, with an unobstructed downhill lip. */
export function makeStartPlatform() {
  const root=new THREE.Group();root.name='start-platform';
  const length=START_PLATFORM.front-START_PLATFORM.back;
  const center=-(START_PLATFORM.front+START_PLATFORM.back)/2;
  const box=(width:number,height:number,depth:number,material:THREE.Material,x:number,y:number,z:number)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),material);
    mesh.position.set(x,y,z);mesh.receiveShadow=true;root.add(mesh);return mesh;
  };
  box(START_PLATFORM.width,0.5,length,frame,0,-0.29,center);
  box(START_PLATFORM.width,0.04,length,top,0,-0.02,center);
  for(const side of [-1,1]) {
    box(0.12,0.55,length,frame,side*(START_PLATFORM.width/2-0.06),0.275,center);
    const stripe=box(0.18,0.004,length-0.3,paint,side*(START_PLATFORM.width/2-0.3),0.002,center);
    stripe.userData.collision=false;
  }
  box(START_PLATFORM.width,0.55,0.12,frame,0,0.275,-START_PLATFORM.back+0.06);
  const lip=box(START_PLATFORM.width-0.24,0.004,0.4,paint,0,0.002,-START_PLATFORM.front+0.2);
  lip.userData.collision=false;
  for(const along of [3,6,8.5]) {
    const marking=arrow(paint);marking.position.set(0,0.004,-along);root.add(marking);
  }
  return root;
}

/** Painted on the solid road, with no raised collision edge to trip the wheels. */
export function makeStartBoostPad() {
  const root=makeBoostPad(START_BOOST.width,START_BOOST.length);root.name='start-boost-pad';return root;
}

export function makeBoostPad(width:number,length:number) {
  const root=new THREE.Group();root.name='boost-pad';root.userData.collision=false;
  const base=new THREE.Mesh(new THREE.BoxGeometry(width,0.004,length),boostPaint);
  base.position.y=0.002;root.add(base);
  for(let along=-length/2+3;along<length/2;along+=5) {
    const marking=arrow(top);marking.scale.setScalar(1.7);marking.position.set(0,0.006,-along);root.add(marking);
  }
  return root;
}
