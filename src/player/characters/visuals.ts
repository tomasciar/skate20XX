import * as THREE from 'three';
import {characterPalette,characterProportions,isCharacterId} from './catalog.ts';
import type {CharacterId} from './catalog.ts';
import {CHARACTER_MODELS} from './registry.ts';
import type {CharacterLimb} from './registry.ts';
import {batchCosmetics} from './cosmetics.ts';
import {headGeometry,torsoRadius,torsoCenter,limbGeometry} from './geometry.ts';
import {applyRideSkin} from '../../mode.ts';
import type {RideMode} from '../../mode.ts';

// Plain slot metadata survives head/limb cloning into portraits and ragdolls.
type CharacterSlot={kind:'head'|'outfit'|'hips'|'shoe'|'hand'|'thigh'|CharacterLimb;side:number};
type Attachments=Map<string,readonly THREE.Object3D[]>;
const templates=new Map<CharacterId,Attachments>();
const selections=new WeakMap<THREE.Object3D,{active?:CharacterId;variants:Map<CharacterId,THREE.Object3D[]>}>();
const key=({kind,side}:CharacterSlot)=>`${kind}:${side}`;
function slot(parent:THREE.Object3D,kind:CharacterSlot['kind'],side=0) {parent.userData.characterSlot={kind,side} satisfies CharacterSlot;}
function look(id:CharacterId,kind:string) {
  const group=new THREE.Group();group.userData.characterSkin=id;group.name=`character-${kind}-${id}`;return group;
}

/** Author a selected attachment once; instances share immutable batched geometry and materials. */
function attachment(id:CharacterId,site:CharacterSlot):readonly THREE.Object3D[] {
  let parts=templates.get(id);if(!parts){parts=new Map();templates.set(id,parts);}
  const known=parts.get(key(site));if(known)return known;
  const model=CHARACTER_MODELS[id];
  if(site.kind==='head' || site.kind==='outfit') {
    const head=look(id,'head'),outfit=look(id,'outfit');head.userData.profile=model.profile;
    const {chestWidth:width,chestDepth:depth}=characterProportions(id);
    const surface=(back:boolean)=>(x:number,y:number)=>{const r=torsoRadius(y,id);return torsoCenter(y,id)*depth+(back?1:-1)*r*depth*Math.sqrt(Math.max(.015,1-(x/(r*width))**2));};
    const skin=new THREE.MeshStandardMaterial({color:characterPalette(id,'skate').skin});
    head.add(new THREE.Mesh(model.headGeometry?model.headGeometry():headGeometry(id),skin));
    const cleanup=model.buildLook({head,outfit,front:surface(false),back:surface(true),width,depth});
    batchCosmetics(head);batchCosmetics(outfit);skin.dispose();cleanup?.();
    parts.set('head:0',[head]);parts.set('outfit:0',[outfit]);
    return parts.get(key(site))!;
  }
  let result:THREE.Object3D[];
  if(site.kind==='hips' || site.kind==='shoe') {
    const group=look(id,site.kind);
    if(site.kind==='hips')model.buildHips?.(group);else model.buildShoe(group);
    batchCosmetics(group);result=group.children.length?[group]:[];
  } else {
    // Limb authoring reads the canonical bone radii, independent of the previously
    // selected rider's overrides. These temporary bones never enter a rendered scene.
    const kind=site.kind,geometry=kind==='hand'?new THREE.BufferGeometry():limbGeometry(kind);
    const material=new THREE.MeshBasicMaterial(),bone=new THREE.Mesh(geometry,material);
    if(kind==='thigh')model.buildThigh?.(bone);
    else if(kind==='hand')model.buildHand?.(bone,site.side);
    else {
      const group=look(id,kind);bone.add(group);
      model.buildLimb(bone,group,kind,site.side);batchCosmetics(group);
    }
    result=[...bone.children];bone.clear();geometry.dispose();material.dispose();
  }
  parts.set(key(site),result);return result;
}

/** Only the selected variant is attached; previously visited variants are cached off the scene graph. */
function select(parent:THREE.Object3D,site:CharacterSlot,id:CharacterId) {
  let state=selections.get(parent);
  if(!state) {
    state={variants:new Map()};selections.set(parent,state);
    // A cloned rig already owns its current attachments, but has no WeakMap state yet.
    for(const child of parent.children)if(isCharacterId(child.userData.characterSkin)) {
      const existing=state.variants.get(child.userData.characterSkin)??[];
      existing.push(child);state.variants.set(child.userData.characterSkin,existing);
    }
  }
  if(state.active===id)return;
  for(const children of state.variants.values())for(const child of children) {
    child.visible=false;if(child.parent===parent)parent.remove(child);
  }
  let selected=state.variants.get(id);
  if(!selected){selected=attachment(id,site).map(object=>object.clone(true));state.variants.set(id,selected);}
  for(const child of selected) {
    child.visible=true;parent.add(child);
    applyRideSkin(child,(parent.userData.characterMode??'skate') as RideMode);
    child.traverse(object=>{if(object.userData.heldWeapon)object.userData.weaponVisible=parent.userData.weaponVisible!==false;});
  }
  state.active=id;
}

export function ensureCharacterVisuals(root:THREE.Object3D,id:CharacterId) {
  const parents:THREE.Object3D[]=[];
  root.traverse(object=>{if(object.userData.characterSlot)parents.push(object);});
  for(const parent of parents)select(parent,parent.userData.characterSlot as CharacterSlot,id);
}

/** Register attachment sites; authoring is deferred until applyCharacterSkin selects a rider. */
export function addCharacterLooks(head:THREE.Group,torso:THREE.Group) {
  slot(head,'head');
  const costumes=new THREE.Group();costumes.userData.characterAttachment=true;slot(costumes,'outfit');torso.add(costumes);
}
export function addCharacterLimbDetails(parent:THREE.Mesh,kind:CharacterLimb|'thigh',side=1) {slot(parent,kind,side);}
export function addCharacterHipDetails(hips:THREE.Group) {
  const group=new THREE.Group();slot(group,'hips');hips.add(group);return group;
}
export function addCharacterShoeDetails(foot:THREE.Group) {slot(foot,'shoe');}
export function addCharacterHandDetails(hand:THREE.Mesh,side:number) {slot(hand,'hand',side);}
