import {CapsuleGeometry,Mesh,MeshStandardMaterial} from 'three';
import type {BufferGeometry,Object3D} from 'three';
import {characterProportions,characterHasShorts,characterHasCartoonHands,isCharacterId} from './catalog.ts';
import type {CharacterId} from './catalog.ts';
import {characterLegGeometry,characterHandGeometry,characterTorsoGeometry,limbGeometry} from './geometry.ts';
import {CHARACTER_MODELS} from './registry.ts';
import type {CharacterBodyPart} from './registry.ts';
import {selectHeldWeapon} from './weapons.ts';

const originalGeometry=new WeakMap<Mesh,BufferGeometry>();
const restoredParts=new Map<string,BufferGeometry>();
function restorePart(kind:'upperarm'|'forearm'|'pelvis'|'sleeve') {
  let geometry=restoredParts.get(kind);
  if(!geometry){geometry=kind==='pelvis'?new CapsuleGeometry(.11,.1,4,10):limbGeometry(kind);restoredParts.set(kind,geometry);}return geometry;
}

export function applyCharacterSkin(root:Object3D,character:CharacterId) {
  const build=characterProportions(character);
  const model=CHARACTER_MODELS[character];
  root.traverse(object=>{
    if(isCharacterId(object.userData.characterSkin)) {
      const selected=object.userData.characterSkin===character;
      if(object.userData.heldWeapon)selectHeldWeapon(object,selected);
      else object.visible=selected;
    }
    const capturedScale=object.userData.ragdollBodyScale ?? 1;
    switch(object.userData.characterBuild) {
      case 'rider':object.scale.setScalar(build.bodyScale);break;
      case 'foot':object.scale.setScalar(object.parent?.userData.characterBuild==='rider'?1/build.bodyScale:1);break;
      case 'chest':
        object.scale.x=build.chestWidth*capturedScale;object.scale.z=build.chestDepth*capturedScale;
        if(object instanceof Mesh)object.geometry=characterTorsoGeometry(character);
        break;
      case 'pelvis':object.scale.set(build.pelvisDepth,build.pelvisWidth,build.pelvisDepth).multiplyScalar(capturedScale);break;
      case 'thigh':case 'shin': {
        const kind=object.userData.characterBuild as 'thigh'|'shin';
        object.scale.x=object.scale.z=build[kind]*capturedScale;
        if(object instanceof Mesh)object.geometry=characterLegGeometry(kind,characterHasShorts(character)?'bare':character==='shaggy'?'flared':character==='peter'?'stocky':character==='light'||character==='mj'?'tailored':'standard');
        break;
      }
      case 'knee':object.scale.setScalar(build.knee*capturedScale);break;
      case 'elbow':object.scale.setScalar(build.elbow*capturedScale);break;
      case 'hand':
        object.scale.setScalar(build.hand*capturedScale);
        if(object instanceof Mesh)object.geometry=characterHandGeometry(object.userData.handSide,characterHasCartoonHands(character));
        break;
      case 'upperarm':object.scale.x=object.scale.z=build.upperarm*capturedScale;break;
      case 'forearm':object.scale.x=object.scale.z=build.forearm*capturedScale;break;
      case 'shoulder':object.scale.set(build.shoulder,build.shoulder*.96,build.shoulder*.92).multiplyScalar(capturedScale);break;
      case 'sleeve':
        object.visible=character!=='goku'&&character!=='spiderman';
        object.scale.x=object.scale.z=(character==='peter'||character==='bart'?build.upperarm:1)*capturedScale;
        break;
    }
    const role=object.userData.characterBuild as CharacterBodyPart|undefined;
    if(role && role!=='sleeve' && object instanceof Mesh)object.visible=true;
    const part=role&&model.rigParts?.[role];
    if(part?.hidden)object.visible=false;
    if(object instanceof Mesh) {
      // Standard foot geometry is a single direct child; registered feet and bindings remain separate.
      if(object.parent?.userData.characterBuild==='foot')object.visible=!model.hideFootwear;
      if(role) {
        if(part?.geometry) {
          if(!object.geometry.userData.characterOverride)originalGeometry.set(object,object.geometry);
          object.geometry=part.geometry(object);
          object.geometry.userData.characterOverride=role;
        } else if(object.geometry.userData.characterOverride && (role==='upperarm'||role==='forearm'||role==='pelvis'||role==='sleeve')) {
          object.geometry=originalGeometry.get(object)??restorePart(role);
        }
        if(object.material instanceof MeshStandardMaterial && object.material.vertexColors!==Boolean(model.vertexColors)) {
          object.material.vertexColors=Boolean(model.vertexColors);object.material.needsUpdate=true;
        }
      }
    }
  });
}
