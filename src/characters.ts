import type {Object3D} from 'three';
import type {RideMode} from './mode.ts';

export const CHARACTERS=[
  {id:'boy',name:'Boy'},
  {id:'girl',name:'Girl'},
  {id:'goku',name:'Goku'},
  {id:'naruto',name:'Naruto'},
  {id:'kick',name:'Kick Buttowski'},
] as const;
export type CharacterId=(typeof CHARACTERS)[number]['id'];
export const CHARACTER_STORAGE_KEY='skate5.character';
type StorageLike=Pick<Storage,'getItem'|'setItem'>;
export function isCharacterId(value:unknown):value is CharacterId {return CHARACTERS.some(character=>character.id===value);}
export function loadCharacter(storage?:StorageLike):CharacterId {
  try {const value=(storage ?? globalThis.localStorage).getItem(CHARACTER_STORAGE_KEY);return isCharacterId(value)?value:'boy';}
  catch {return 'boy';}
}
export function saveCharacter(character:CharacterId,storage?:StorageLike) {
  try {(storage ?? globalThis.localStorage).setItem(CHARACTER_STORAGE_KEY,character);}catch { /* Storage may be disabled. */ }
}

export type CharacterPalette={skin:number;shirt:number;pants:number;arms:number;sleeves:number;shoes:number;helmet:number;hair:number;accent:number;gloves:number;knees:number};
const PALETTES:Record<CharacterId,CharacterPalette>={
  boy:{skin:0xc48a65,shirt:0x267a79,pants:0x293b4a,arms:0xc48a65,sleeves:0x267a79,shoes:0x253035,helmet:0xef7846,hair:0x493228,accent:0xef7846,gloves:0x202e32,knees:0x202e32},
  girl:{skin:0xc48a65,shirt:0x984b79,pants:0x263e52,arms:0xc48a65,sleeves:0x984b79,shoes:0x315563,helmet:0x58c1b9,hair:0x493028,accent:0x58c1b9,gloves:0x25333b,knees:0x25333b},
  goku:{skin:0xe5ad80,shirt:0xf27a28,pants:0xf27a28,arms:0xe5ad80,sleeves:0x243c86,shoes:0x243c86,helmet:0x243c86,hair:0x151c25,accent:0x243c86,gloves:0xe5ad80,knees:0xf27a28},
  naruto:{skin:0xf0c28e,shirt:0xee872d,pants:0xee872d,arms:0x252c35,sleeves:0x252c35,shoes:0x28323b,helmet:0x252c35,hair:0xf1ce45,accent:0xbd4439,gloves:0xf0c28e,knees:0xee872d},
  kick:{skin:0xecc09a,shirt:0xf1f0e4,pants:0xf1f0e4,arms:0xf1f0e4,sleeves:0xf1f0e4,shoes:0xf3c93e,helmet:0xf1f0e4,hair:0x493028,accent:0xdf3b34,gloves:0xf3c93e,knees:0xf1f0e4},
};
export function characterPalette(character:CharacterId,mode:RideMode):CharacterPalette {
  const palette=PALETTES[character];
  if(mode==='skate')return {...palette};
  if(character==='boy')return {...palette,shirt:0xe35e42,arms:0xe35e42,sleeves:0xe35e42,pants:0x233c56,helmet:0x315e82};
  if(character==='girl')return {...palette,shirt:0x984b79,arms:0x984b79};
  return {...palette};
}

/** Cosmetic scale is independent of the board and the riding collision solver.
 * Kick's legs are 15% shorter (`legScale`) and 15% thicker (thigh, shin and knee below) than his first build;
 * the crash rig in `skaterVisual.ts` uses the same factors. */
export function characterProportions(character:CharacterId) {
  return {bodyScale:character==='kick'?.76:1,legScale:character==='kick'?.799:1,chestWidth:character==='goku'?1.22:character==='girl'?.95:character==='kick'?1.18:1,
    chestDepth:.65*(character==='goku'?1.2:character==='kick'?1.32:1),upperarm:character==='goku'?1.32:character==='kick'?1.1:1,
    forearm:character==='goku'?1.2:character==='kick'?1.1:1,shoulder:character==='goku'?1.24:character==='kick'?1.08:1};
}
export function applyCharacterSkin(root:Object3D,character:CharacterId) {
  const build=characterProportions(character);
  root.traverse(object=>{
    if(isCharacterId(object.userData.characterSkin))object.visible=object.userData.characterSkin===character;
    const capturedScale=object.userData.ragdollBodyScale ?? 1;
    switch(object.userData.characterBuild) {
      case 'rider':object.scale.setScalar(build.bodyScale);break;
      case 'foot':object.scale.setScalar(object.parent?.userData.characterBuild==='rider'?1/build.bodyScale:1);break;
      case 'chest':object.scale.x=build.chestWidth*capturedScale;object.scale.z=build.chestDepth*capturedScale;break;
      case 'thigh':object.scale.x=object.scale.z=(character==='goku'?1.04:character==='naruto'?.94:character==='kick'?1.357:build.chestWidth)*capturedScale;break;
      case 'shin':object.scale.x=object.scale.z=(character==='kick'?1.311:1)*capturedScale;break;
      case 'knee':object.scale.setScalar((character==='goku'?.9:character==='naruto'?.84:character==='kick'?1.242:1)*capturedScale);break;
      case 'upperarm':object.scale.x=object.scale.z=build.upperarm*capturedScale;break;
      case 'forearm':object.scale.x=object.scale.z=build.forearm*capturedScale;break;
      case 'shoulder':object.scale.set(build.shoulder,build.shoulder*.96,build.shoulder*.92).multiplyScalar(capturedScale);break;
      case 'sleeve':object.visible=character!=='goku';break;
    }
  });
}
