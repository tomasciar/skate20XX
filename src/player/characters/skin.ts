import {Mesh} from 'three';
import type {Object3D} from 'three';
import {characterProportions,characterHasShorts,characterHasCartoonHands,isCharacterId} from './catalog.ts';
import type {CharacterId} from './catalog.ts';
import {characterLegGeometry,characterHandGeometry,characterTorsoGeometry} from './geometry.ts';

export function applyCharacterSkin(root:Object3D,character:CharacterId) {
  const build=characterProportions(character);
  root.traverse(object=>{
    if(isCharacterId(object.userData.characterSkin))object.visible=object.userData.characterSkin===character;
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
  });
}
