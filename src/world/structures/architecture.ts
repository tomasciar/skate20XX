import * as THREE from 'three';
import {sceneryMaterial,markAsset} from '../props/variety.ts';
import {facadeMaterial} from '../rendering/appearance.ts';

const shared=<T extends THREE.BufferGeometry>(geometry:T)=>{geometry.userData.shared=true;return geometry;};
const cube=shared(new THREE.BoxGeometry()),panel=shared(new THREE.PlaneGeometry());
const cylinder=shared(new THREE.CylinderGeometry(.5,.5,1,10));
const roof=shared((()=>{
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([
    -.5,0,-.5,.5,0,-.5,0,1,-.5, -.5,0,.5,0,1,.5,.5,0,.5,
    -.5,0,-.5,0,1,-.5,0,1,.5, -.5,0,-.5,0,1,.5,-.5,0,.5,
    .5,0,.5,0,1,.5,0,1,-.5, .5,0,.5,0,1,-.5,.5,0,-.5,
    -.5,0,.5,.5,0,.5,.5,0,-.5, -.5,0,.5,.5,0,-.5,-.5,0,-.5,
  ],3));
  // The closed wedge must face outward. An inverted roof hides its slopes and exposes
  // its underside on the wall's top face, producing severe depth flicker.
  const positions=g.getAttribute('position');
  for(let i=0;i<positions.count;i+=3) {
    const b=new THREE.Vector3().fromBufferAttribute(positions,i+1),c=new THREE.Vector3().fromBufferAttribute(positions,i+2);
    positions.setXYZ(i+1,c.x,c.y,c.z);positions.setXYZ(i+2,b.x,b.y,b.z);
  }
  g.computeVertexNormals();return g;
})());
const wall=sceneryMaterial(0xc7af8f,0,.88,'paint'),trim=sceneryMaterial(0xf1ead8,0,.85,'trim');
const roofing=sceneryMaterial(0x667780,0,.85,'roof'),stone=sceneryMaterial(0x879295,0,.9,'stone');
const glass=facadeMaterial(sceneryMaterial(0x6f9aa8,.25,.55,'glass'));
const accent=sceneryMaterial(0x398d91,0,.85,'accent'),metal=sceneryMaterial(0x53646b,.4,.75,'metal');

export const ARCHITECTURE_STYLES=['rowhouse','arcade','warehouse','terrace','loft'] as const;
export type ArchitectureStyle=typeof ARCHITECTURE_STYLES[number];

/** New silhouettes occupy the existing frontage slots and share seven tintable materials. */
export function makeArchitecture(rng:()=>number,style:ArchitectureStyle) {
  const root=markAsset(new THREE.Group(),'architecture');root.name=`architecture-${style}`;
  root.userData.placement='pad';root.userData.frontage=true;root.userData.cityKind='building';root.userData.assetVariant=style;
  const width=style==='warehouse'?9:style==='loft'?7.2:8.2,depth=style==='warehouse'?7.4:6.4;
  root.userData.width=width+.4;root.userData.depth=depth+.4;
  const part=(geometry:THREE.BufferGeometry,material:THREE.Material,size:number[],at:number[],decorative=false)=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.scale.set(size[0]!,size[1]!,size[2]!);mesh.position.set(at[0]!,at[1]!,at[2]!);
    if(decorative)mesh.userData.collision=false;root.add(mesh);return mesh;
  };
  const box=(material:THREE.Material,size:number[],at:number[],decorative=false)=>part(cube,material,size,at,decorative);
  const window=(x:number,y:number,z=depth/2+.045,w=1.15,h=1.45)=>{
    const mesh=part(panel,glass,[w,h,1],[x,y,z],true);mesh.userData.variantPart='window';return mesh;
  };
  const door=(x=0)=>{box(accent,[1.15,2.35,.08],[x,1.38,depth/2+.045],true);window(x,1.65,depth/2+.095,.7,1.1);};
  box(stone,[width+.4,.24,depth+.4],[0,.12,0]);
  if(style==='rowhouse') {
    const colours=[0xc27a63,0x8aab9d,0xc7b381,0x8f99b8,0xbc929c];
    for(let unit=0;unit<3;unit++) {
      const x=(unit-1)*width/3,height=6.4+(unit%2)*1.2+rng()*.5;
      box(wall,[width/3-.08,height,depth],[x,height/2+.24,0]).userData.sceneryTint=colours[Math.floor(rng()*colours.length)];
      part(roof,roofing,[width/3+.14,1.25,depth+.3],[x,height+.24,0]);
      door(x);for(const y of [4.1,6.6])if(y<height)window(x,y,undefined,1.25,1.4);
      box(trim,[.1,height,.1],[x-width/6+.08,height/2+.24,depth/2+.06],true);
      box(stone,[1.4,.2,.65],[x,.27,depth/2+.35]);
    }
  } else if(style==='arcade') {
    // A genuinely open colonnade beneath the upper floor, with a solid rear wall.
    box(wall,[width,6.7,depth*.48],[0,3.59,-depth*.26]);
    box(wall,[width,3.7,depth],[0,5.09,0]);
    for(const x of [-3.5,-1.2,1.2,3.5]) {
      box(trim,[.24,2.85,.24],[x,1.66,depth/2-.2]);
      box(trim,[.52,.16,.52],[x,3.01,depth/2-.2]);
    }
    box(roofing,[width+.4,.24,depth+.4],[0,7.06,0]);
    for(const x of [-2.7,0,2.7])window(x,5.1,undefined,1.7,1.8);
    box(accent,[width,.55,.12],[0,3.55,depth/2+.08],true);
  } else if(style==='warehouse') {
    box(wall,[width,5.2,depth],[0,2.84,0]);part(roof,roofing,[width+.4,1.7,depth+.4],[0,5.44,0]);
    box(metal,[3.8,3.9,.09],[0,2.19,depth/2+.05],true);
    for(let y=.7;y<3.9;y+=.55)box(trim,[3.5,.045,.035],[0,y,depth/2+.11],true);
    for(const x of [-3,3])window(x,3.8,undefined,1.2,1.15);
    for(const x of [-width/2+.15,width/2-.15])box(accent,[.16,5.1,.12],[x,2.79,depth/2+.08],true);
  } else if(style==='terrace') {
    box(wall,[width,5.8,depth],[0,3.14,0]);
    box(wall,[width*.68,3.8,depth*.68],[-width*.1,7.94,-depth*.16]);
    for(const [y,w,d,cx,cz] of [[6.08,width+.3,depth+.3,0,0],[9.98,width*.72,depth*.72,-width*.1,-depth*.16]])
      box(trim,[w,.2,d],[cx,y,cz]);
    for(const x of [-2.7,0,2.7])for(const y of [1.7,4.4])window(x,y);
    for(const x of [-2,1])window(x,8.1,depth*.18+.045,1.2,1.6);
    for(const x of [-2.8,0,2.8])box(accent,[1.1,.45,.7],[x,6.4,depth/2-.4]);
    box(metal,[width,.12,.1],[0,6.93,depth/2-.16]);door();
  } else {
    const height=9.7+rng()*1.4;
    box(wall,[width,height,depth],[0,height/2+.24,0]);box(roofing,[width+.4,.25,depth+.4],[0,height+.36,0]);
    for(const y of [1.8,4.6,7.4])for(const x of [-2.1,0,2.1])window(x,y,undefined,1.15,1.8);
    for(const y of [3.3,6.1,8.9])box(trim,[width+.1,.12,depth+.1],[0,y,0],true);
    part(cylinder,metal,[1.8,1.8,1.8],[1.5,height+1.4,-1.2]);
    for(const x of [.9,2.1])box(metal,[.1,.8,.1],[x,height+.75,-1.2]);door();
  }
  // Side/rear glazing helps every silhouette read from both directions while spinning.
  for(const side of [-1,1])for(const z of [-1.5,1.5])window(side*(width/2+.045),3.9,z).rotation.y=side*Math.PI/2;
  return root;
}
