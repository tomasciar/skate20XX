import * as THREE from 'three';
import {surface,facadeMaterial} from '../rendering/appearance.ts';
import {seededRandom} from '../planning/generation.ts';
import type {District} from '../environments/catalog.ts';
import {ENVIRONMENT_BY_ID} from '../environments/catalog.ts';
import {addAssetDetails} from './assetDetails.ts';
import {landscapePaletteAt} from '../environments/palettes.ts';

type PaletteRole='paint'|'roof'|'wood'|'cutwood'|'stone'|'foliage'|'autumn'|'flower'|'glass'|'trim'|'accent'|'metal'|'straw';
const PALETTES:Record<PaletteRole,readonly number[]>={
  paint:[0xc46c50,0xe3c58c,0x75a6a0,0x819db6,0xe0ad58,0xcba5af,0xe5dfcc,0x587c83,0x9a7665,0x9caa85,0xd38972,0xa4b7bd,0x506d83,0xb75145,0x697f64,0xbaa6c4],
  roof:[0x795345,0x566b76,0x53645c,0xa6674a,0x8c5559,0x454e61,0x637e80,0x817969],
  wood:[0x936847,0x6c4937,0xb08458,0x856d50,0x765944,0xaa7c60,0x655a4a],
  cutwood:[0xc99a63,0xdbba82,0xb58c61,0xe0c99b,0xbba579],
  stone:[0x858d91,0xa89880,0x8c807a,0x7c8e88,0xb2aaa0,0x76848e,0xa69a91,0x64787d],
  foliage:[0x32633f,0x588246,0x72934e,0x2d7165,0x456e52,0x6b895a,0x315f59,0x7e9259],
  autumn:[0xd89834,0xb75b3e,0xc77d38,0xa54949,0xe0b44f,0xa87c48,0xc98965],
  flower:[0xe4b2bd,0xd4c5df,0xe7cf83,0xcc8f9a,0xf0d9be],
  glass:[0x78a4b0,0x5d8e9c,0x7eaaa0,0x8298b0,0x759fae],
  trim:[0xe9dfc7,0xf0e9dc,0xd2d6ce,0xd9cdb7,0xbec8c8],
  accent:[0xd87645,0x398d91,0xa84d4d,0x6b8299,0xc8a346,0x72875c,0xb77d91,0x426a7c],
  metal:[0x546771,0x687577,0x66716b,0x796b5c,0x4f6370],
  straw:[0xdabf6b,0xcbb877,0xbaa16a,0xe3c98b],
};
const roles=new Map<number,PaletteRole>();
function role(name:PaletteRole,colors:number[]){for(const color of colors)roles.set(color,name);}
role('paint',[0xdab786,0x88a6a0,0xc99578,0xa9bfd0,0xe8d28c,0xece6d8,0xa9604a,0x9c3b2e,0xb87055,0xd8c6a4,0x81949c,0x687985]);
role('roof',[0x874c3f,0x4d5a63,0x6b4636]);role('wood',[0x886044,0x5a4030,0x8d867a]);role('cutwood',[0xc79a62]);
role('stone',[0x879295,0xb4b2a8,0x969e9d]);role('trim',[0xf1ead8,0xe5e0d2]);
role('foliage',[0x668c55,0x2f6b3a,0x3c7d46,0x245832,0x4d8b4a,0x1f4a35,0x8fb65a]);
role('autumn',[0xc98a2b,0xb5562b,0xd8b23a]);role('flower',[0xe9b8c0]);role('glass',[0x6f9aa8,0x477789]);
role('accent',[0xf27635,0x288d8b,0xdb6546]);role('metal',[0x53646b,0x7f9296,0x8a5a3c,0x53636e]);role('straw',[0xd9b95f]);

/** One material per surface finish; per-object colours are encoded during static batching. */
export function sceneryMaterial(color:number,metalness=0,roughness=0.8,paletteRole?:PaletteRole) {
  const material=surface(new THREE.MeshStandardMaterial({color,metalness,roughness,vertexColors:true}),'scenery');
  material.userData.paletteRole=paletteRole ?? roles.get(color);
  if(material.userData.paletteRole==='glass')facadeMaterial(material);
  return material;
}
export function markAsset<T extends THREE.Object3D>(object:T,family:string):T {
  object.userData.assetFamily=family;if(!object.name)object.name=`asset-${family}`;return object;
}
const shared=<T extends THREE.BufferGeometry>(geometry:T)=>{geometry.userData.shared=true;return geometry;};
const canopyShapes=[shared(new THREE.DodecahedronGeometry(1.15)),shared(new THREE.ConeGeometry(1.15,2.6,7)),shared(new THREE.CylinderGeometry(0.7,1.1,2.6,6))];
const firShape=shared(new THREE.ConeGeometry(1.1,3.5,4)),blockRock=shared(new THREE.BoxGeometry(0.85,0.85,0.85));
const facetedDrum=shared(new THREE.CylinderGeometry(0.5,0.5,1,6));
const cube=shared(new THREE.BoxGeometry()),panel=shared(new THREE.PlaneGeometry());
const containerBody=sceneryMaterial(0xffffff,0,0.85,'paint'),containerDetail=facadeMaterial(sceneryMaterial(0xffffff,0.15,0.75,'accent'));
export const CONTAINER_VARIANTS=['planter','shipping-crate','utility-cabinet','recycling-station','tool-chest','water-trough',
  'parcel-locker','cooler','equipment-case','market-crate','stone-planter','storage-chest'] as const;
export type ContainerVariant=(typeof CONTAINER_VARIANTS)[number];
export const TERMINAL_VARIANTS=['parking-meter','mailbox','charging-point','parcel-drop','ticket-machine','utility-post',
  'trail-marker','dog-waste-station','emergency-phone','tourist-map','bike-repair-post','wifi-post'] as const;
export type TerminalVariant=(typeof TERMINAL_VARIANTS)[number];

/** Every container shares the same visible solid shell and exact collision template. */
export function makeContainerVariant(kind:ContainerVariant) {
  const root=markAsset(new THREE.Group(),'container');root.userData.placement='pad';root.userData.collisionFamily='street-container';root.userData.assetVariant=kind;
  const body=new THREE.Mesh(cube,containerBody);body.scale.set(1.6,0.9,1.6);body.position.y=0.45;root.add(body);
  function decal(width:number,height:number,x:number,y:number,z:number,rotation=0) {
    const mesh=new THREE.Mesh(panel,containerDetail);mesh.scale.set(width,height,1);mesh.position.set(x,y,z);mesh.rotation.y=rotation;
    mesh.userData.collision=false;root.add(mesh);return mesh;
  }
  if(kind==='planter' || kind==='water-trough' || kind==='stone-planter') {
    const top=decal(1.35,1.35,0,0.904,0);top.rotation.x=-Math.PI/2;top.userData.sceneryTint=kind==='water-trough'?0x4d8591:0x648553;
    for(const side of [-1,1])decal(1.35,0.12,0,0.7,side*0.804,side<0?Math.PI:0);
  } else if(kind==='shipping-crate') {
    for(const side of [-1,1])for(const x of [-0.55,0.55])decal(0.1,0.75,x,0.45,side*0.804,side<0?Math.PI:0);
  } else if(kind==='parcel-locker') {
    for(const x of [-0.36,0.36])for(let row=0;row<3;row++)decal(0.61,0.22,x,0.17+row*0.27,0.804);
  } else if(kind==='cooler' || kind==='storage-chest') {
    const lid=decal(1.48,1.48,0,0.904,0);lid.rotation.x=-Math.PI/2;
    if(kind==='cooler')lid.userData.sceneryTint=0xe4e7db;
    for(const x of [-0.5,0.5])decal(kind==='cooler'?0.32:0.1,kind==='cooler'?0.08:0.75,x,0.48,0.804);
  } else if(kind==='equipment-case') {
    for(const side of [-1,1])for(const x of [-0.62,0.62])for(const y of [0.15,0.75])decal(0.22,0.18,x,y,side*0.804,side<0?Math.PI:0);
  } else if(kind==='market-crate') {
    for(let row=0;row<4;row++)decal(1.4,0.07,0,0.16+row*0.2,0.804);
    const produce=decal(1.3,1.3,0,0.904,0);produce.rotation.x=-Math.PI/2;produce.userData.sceneryTint=0xaabc67;
  } else {
    const rows=kind==='tool-chest'?4:kind==='utility-cabinet'?3:2;
    for(let row=0;row<rows;row++)decal(1.32,kind==='recycling-station'?0.18:0.055,0,0.2+row*0.18,0.804);
    if(kind==='recycling-station')for(const x of [-0.43,0,0.43]) {
      const lid=decal(0.35,0.52,x,0.904,0);lid.rotation.x=-Math.PI/2;
    }
  }
  return root;
}

/** Thin roadside items also share one pole/head collision family. */
export function makeTerminalVariant(kind:TerminalVariant) {
  const root=markAsset(new THREE.Group(),'street-terminal');root.userData.placement='pad';root.userData.collisionFamily='street-post';root.userData.assetVariant=kind;
  const pole=new THREE.Mesh(cube,containerDetail);pole.scale.set(0.09,1.25,0.09);pole.position.y=0.625;root.add(pole);
  const head=new THREE.Mesh(cube,containerBody);head.scale.set(0.33,0.5,0.24);head.position.y=1.5;root.add(head);
  function face(width:number,height:number,x:number,y:number,rotation=0) {
    const detail=new THREE.Mesh(panel,containerDetail);detail.scale.set(width,height,1);
    detail.position.set(x,y,0.124);detail.rotation.z=rotation;detail.userData.collision=false;root.add(detail);
  }
  if(kind==='mailbox') {face(0.23,0.018,0,1.43);face(0.23,0.018,0,1.57);face(0.14,0.018,-0.04,1.52,-0.5);face(0.14,0.018,0.04,1.52,0.5);}
  else if(kind==='charging-point') {face(0.14,0.28,-0.04,1.5);face(0.035,0.25,0.1,1.45);}
  else if(kind==='parcel-drop') {face(0.25,0.035,0,1.64);for(const x of [-0.07,0.07])face(0.1,0.15,x,1.46);}
  else if(kind==='ticket-machine') {face(0.23,0.15,0,1.58);face(0.17,0.025,-0.03,1.38);face(0.04,0.04,0.1,1.44);}
  else if(kind==='trail-marker') {face(0.17,0.025,-0.025,1.55,-0.6);face(0.17,0.025,-0.025,1.45,0.6);face(0.025,0.2,0.09,1.5);}
  else if(kind==='dog-waste-station') {face(0.24,0.045,0,1.62);face(0.12,0.17,0,1.43);}
  else if(kind==='emergency-phone') {face(0.035,0.23,-0.08,1.5);face(0.11,0.045,-0.04,1.61);face(0.11,0.045,-0.04,1.39);}
  else if(kind==='tourist-map') {face(0.22,0.025,0,1.6);face(0.16,0.025,-0.02,1.49,0.5);face(0.12,0.025,0.03,1.38,-0.6);}
  else if(kind==='bike-repair-post') {face(0.22,0.03,0,1.5,0.65);face(0.22,0.03,0,1.5,-0.65);face(0.035,0.16,0,1.55);}
  else if(kind==='wifi-post') {for(const y of [1.45,1.57]){face(0.11,0.025,-0.04,y,0.45);face(0.11,0.025,0.04,y,-0.45);}}
  else if(kind==='utility-post')for(let row=0;row<3;row++)face(0.23,0.025,0,1.4+row*0.08);
  else {face(0.22,0.12,0,1.59);face(0.15,0.04,0,1.39);}
  return root;
}

const CONIFER_GREENS=[0x244c3d,0x315b44,0x365e52,0x496946];
function hash(value:string) {let result=0;for(let i=0;i<value.length;i++)result=Math.imul(result,31)^value.charCodeAt(i);return result;}

/** A separate stream preserves all placement decisions and gameplay encounter IDs. */
export function varyScenery(original:THREE.Object3D,district:District,index:number,slot:number):THREE.Object3D {
  const seed=Math.imul(index,0x45d9f3b)^Math.imul(slot+1,0x27d4eb2d)^hash(district);
  const rng=seededRandom(seed),details=seededRandom(seed^0x6e624eb7),detailStyle=Math.floor(details()*4);
  const family=original.userData.assetFamily as string|undefined,variant=Math.floor(rng()*6);
  let root=original;
  if(family==='planter')root=makeContainerVariant(CONTAINER_VARIANTS[Math.floor(details()*CONTAINER_VARIANTS.length)]!);
  if(family==='city-parking-meter')root=makeTerminalVariant(TERMINAL_VARIANTS[Math.floor(details()*TERMINAL_VARIANTS.length)]!);
  if(!root.userData.assetVariant)root.userData.assetVariant=variant;
  const colors=new Map<PaletteRole,number>();
  const colourway=landscapePaletteAt(index);
  const paints=ENVIRONMENT_BY_ID.get(district)!.paint ?? PALETTES.paint;
  for(const name of Object.keys(PALETTES) as PaletteRole[]) {
    const palette=name==='paint'?paints:name==='autumn'?colourway.autumn:name==='foliage'?colourway.foliage:PALETTES[name];colors.set(name,palette[Math.floor(rng()*palette.length)]!);
  }
  // Compact/tall/low-pitched variants retain the existing reserved footprint.
  if(root.userData.placement==='pad' && !root.userData.collisionFamily && family!=='city-hydrant' && family!=='parking-meter') {
    root.scale.x*=0.9+rng()*0.1;root.scale.z*=0.9+rng()*0.1;
  }
  root.traverse(object=>{
    if(object.userData.variantPart==='roof')object.scale.y*=variant===0?0.16:0.65+variant*0.09;
    if(!(object instanceof THREE.Mesh) || Array.isArray(object.material))return;
    const mat=object.material as THREE.MeshStandardMaterial,name=mat.userData.paletteRole as PaletteRole|undefined;
    if(name && object.userData.sceneryTint===undefined)object.userData.sceneryTint=colors.get(name);
    if(name==='foliage' && family==='tree' && (root.userData.treeStyle==='pine' || root.userData.treeStyle==='cedar')) {
      object.userData.sceneryTint=CONIFER_GREENS[variant%CONIFER_GREENS.length];
    }
    if(name==='paint' && root.userData.assetVariant==='stone-planter')object.userData.sceneryTint=colors.get('stone');
    if(name==='paint' && (root.userData.assetVariant==='market-crate' || root.userData.assetVariant==='storage-chest'))object.userData.sceneryTint=colors.get('wood');
    if(name==='paint' && root.userData.assetVariant==='equipment-case')object.userData.sceneryTint=colors.get('metal');
    if(family==='tree' && object.userData.variantPart==='crown') {
      if(object.geometry.type==='IcosahedronGeometry' && variant>0 && variant<4)object.geometry=canopyShapes[variant-1]!;
      else if(object.geometry.type==='ConeGeometry' && variant===4)object.geometry=firShape;
      if(variant===5)object.scale.set(object.scale.x*0.7,object.scale.y*1.15,object.scale.z*0.7);
    }
    if(family==='rocks' && variant<3)object.geometry=blockRock;
    if(family==='bush' && variant===2)object.geometry=canopyShapes[1]!;
    if(family==='bush' && variant===3 && name==='foliage')object.userData.sceneryTint=colors.get('flower');
    if(family==='bench' && name==='wood' && variant%3===1)object.userData.sceneryTint=colors.get('stone');
    if(family==='bench' && name==='wood' && variant%3===2)object.userData.sceneryTint=colors.get('accent');
    if(family==='hay-bale') {
      if(variant<2)object.geometry=cube;
      if(variant===3 || variant===4)object.userData.sceneryTint=variant===3?0xdce1ca:0x90a58d;
    }
    if((family==='silo' || family==='tank') && variant%2===0 && object.geometry.type==='CylinderGeometry' && object.scale.x>1)object.geometry=facetedDrum;
    if(family==='log-pile' && variant===1 && object.geometry.type==='CylinderGeometry' && object.scale.y>1)object.geometry=cube;
    if(family==='lumber-stack' && name==='cutwood' && variant%2===0)object.userData.sceneryTint=colors.get('metal');
    if((family==='fence' || family==='yard-fence') && name==='wood' && variant<3)object.userData.sceneryTint=colors.get(variant===0?'trim':variant===1?'accent':'metal');
    if((family==='city-building' || family==='city-tower') && object.userData.variantPart==='window') {
      if(variant===0){object.scale.x*=1.1;object.scale.y*=0.72;}
      if(variant===1){object.scale.x*=0.7;object.scale.y*=1.15;}
      if(variant===2){object.scale.x*=0.86;object.scale.y*=0.86;}
      if(variant===3) {
        const offset=object.userData.windowRow%2?0.22:-0.22;
        object.position.x+=Math.cos(object.rotation.y)*offset;object.position.z-=Math.sin(object.rotation.y)*offset;
      }
      if(variant===4)object.userData.sceneryTint=colors.get('glass');
    }
  });
  if(family==='tree')root.scale.y*=0.9+variant*0.04;
  if(family==='fence' || family==='yard-fence')root.scale.y*=variant%2===0?0.85:1;
  if(family==='car')varyCar(root,variant);
  addAssetDetails(root,family,detailStyle,containerDetail,colors.get('accent')!,colors.get('trim')!);
  return root;
}

function varyCar(root:THREE.Object3D,variant:number) {
  // Existing window, pillar, and roof pieces become coupes, wagons, pickups and taller cabs.
  if(root.userData.vehicleStyle==='van')return;
  const height=variant===1?0.76:variant===4?1.2:1,length=variant===2?1.25:variant===3?0.65:1;
  const center=variant===3?0.5:variant===2?-0.35:-0.15,dy=(height-1)*0.3;
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const role=object.material.userData.paletteRole;
    if(role==='glass' && object.scale.y>0.45) {object.scale.y*=height;object.scale.z*=length;object.position.y+=dy;object.position.z=center;}
    if(role==='paint' && object.position.y>1.2) {
      if(object.scale.y<0.2) {object.scale.z*=length;object.position.z=center;object.position.y+=dy*2;}
      else {object.scale.y*=height;object.position.y+=dy;object.position.z=center+(object.position.z+0.15)*length;}
    }
  });
}

// Shared constant colour attributes avoid allocating/filling a new RGB array for every prop part.
const tintAttributes=new Map<string,THREE.BufferAttribute>(),target=new THREE.Color();
export const TINT_CACHE_LIMIT=512;
export function applySceneryTint(geometry:THREE.BufferGeometry,mesh:THREE.Mesh) {
  const mat=mesh.material as THREE.MeshStandardMaterial;
  if(!mat.vertexColors || geometry.getAttribute('color'))return;
  const tint=mesh.userData.sceneryTint as number|undefined,count=geometry.getAttribute('position').count;
  const key=`${count}:${tint ?? 'white'}:${tint===undefined?0:mat.id}`;
  let attribute=tintAttributes.get(key);
  if(!attribute) {
    const values=new Uint16Array(count*3);target.setHex(tint ?? 0xffffff);
    const r=tint===undefined?1:target.r/Math.max(mat.color.r,1e-5),g=tint===undefined?1:target.g/Math.max(mat.color.g,1e-5),b=tint===undefined?1:target.b/Math.max(mat.color.b,1e-5);
    const hr=THREE.DataUtils.toHalfFloat(r),hg=THREE.DataUtils.toHalfFloat(g),hb=THREE.DataUtils.toHalfFloat(b);
    for(let i=0;i<values.length;i+=3){values[i]=hr;values[i+1]=hg;values[i+2]=hb;}
    attribute=new THREE.Float16BufferAttribute(values,3);tintAttributes.set(key,attribute);
    if(tintAttributes.size>TINT_CACHE_LIMIT)tintAttributes.delete(tintAttributes.keys().next().value!);
  }
  geometry.setAttribute('color',attribute);
}
