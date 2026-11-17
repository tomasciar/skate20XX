import * as THREE from 'three';
import {CHARACTERS,characterPalette,characterProportions} from './catalog.ts';
import type {CharacterId} from './catalog.ts';
import {CHARACTER_MODELS} from './registry.ts';
import type {CharacterLimb} from './registry.ts';
import {batchCosmetics} from './cosmetics.ts';
import {headGeometry,torsoRadius,torsoCenter} from './geometry.ts';

function look(parent:THREE.Object3D,id:CharacterId,kind:string) {
  const group=new THREE.Group();group.userData.characterSkin=id;group.name=`character-${kind}-${id}`;parent.add(group);return group;
}

/** Assemble registered models on the shared skeleton, preserving batched materials and attachment tags. */
export function addCharacterLooks(head:THREE.Group,torso:THREE.Group) {
  const costumes=new THREE.Group();costumes.userData.characterAttachment=true;torso.add(costumes);
  for(const {id} of CHARACTERS) {
    const model=CHARACTER_MODELS[id],group=look(head,id,'head'),outfit=look(costumes,id,'outfit');
    group.userData.profile=model.profile;
    const {chestWidth:width,chestDepth:depth}=characterProportions(id);
    const clothSurface=(back:boolean)=>(x:number,y:number)=>{const r=torsoRadius(y,id);return torsoCenter(y,id)*depth+(back?1:-1)*r*depth*Math.sqrt(Math.max(.015,1-(x/(r*width))**2));};
    const skin=new THREE.MeshStandardMaterial({color:characterPalette(id,'skate').skin});
    group.add(new THREE.Mesh(model.headGeometry?model.headGeometry():headGeometry(id),skin));
    const cleanup=model.buildLook({head:group,outfit,front:clothSurface(false),back:clothSurface(true),width,depth});
    batchCosmetics(group);batchCosmetics(outfit);
    skin.dispose();cleanup?.();
  }
}

/** Bone-local cuffs, wraps and shorts inherit the existing animated bone scale. */
export function addCharacterLimbDetails(parent:THREE.Mesh,kind:CharacterLimb|'thigh',side=1) {
  if(kind==='thigh') {
    for(const {id} of CHARACTERS)CHARACTER_MODELS[id].buildThigh?.(parent);
    return;
  }
  for(const {id} of CHARACTERS) {
    const group=look(parent,id,kind);
    CHARACTER_MODELS[id].buildLimb(parent,group,kind,side);
    batchCosmetics(group);
  }
}

export function addCharacterHipDetails(hips:THREE.Group) {
  const group=new THREE.Group();hips.add(group);
  for(const {id} of CHARACTERS) {
    const build=CHARACTER_MODELS[id].buildHips;
    if(!build)continue;
    const detail=look(group,id,'hips');build(detail);batchCosmetics(detail);
  }
  return group;
}

export function addCharacterShoeDetails(foot:THREE.Group) {
  for(const {id} of CHARACTERS) {
    const group=look(foot,id,'shoe');
    CHARACTER_MODELS[id].buildShoe(group);batchCosmetics(group);
  }
}

/** Character props follow the wrist in riding poses and captured crash clones. */
export function addCharacterHandDetails(hand:THREE.Mesh,side:number) {
  for(const {id} of CHARACTERS)CHARACTER_MODELS[id].buildHand?.(hand,side);
}
