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
  goku:{skin:0xe5ad80,shirt:0xf27a28,pants:0xf27a28,arms:0xe5ad80,sleeves:0x243c86,shoes:0x243c86,helmet:0x243c86,hair:0x151c25,accent:0x243c86,gloves:0x243c86,knees:0xf27a28},
  naruto:{skin:0xf0c28e,shirt:0xee872d,pants:0xee872d,arms:0x252c35,sleeves:0x252c35,shoes:0x28323b,helmet:0x252c35,hair:0xf1ce45,accent:0xbd4439,gloves:0x252c35,knees:0xee872d},
  kick:{skin:0xecc09a,shirt:0xf1f0e4,pants:0xf1f0e4,arms:0xf1f0e4,sleeves:0xf1f0e4,shoes:0xf3c93e,helmet:0xf1f0e4,hair:0x493028,accent:0xdf3b34,gloves:0xf3c93e,knees:0xf1f0e4},
};
export function characterPalette(character:CharacterId,mode:RideMode):CharacterPalette {
  const palette=PALETTES[character];
  if(mode==='skate')return {...palette};
  if(character==='boy')return {...palette,shirt:0xe35e42,arms:0xe35e42,sleeves:0xe35e42,pants:0x233c56,helmet:0x315e82};
  if(character==='girl')return {...palette,shirt:0x984b79,arms:0x984b79};
  return {...palette,arms:character==='goku'?palette.shirt:palette.arms};
}

/** Tags survive ragdoll cloning; cosmetics never change the shared skeleton or colliders. */
export function applyCharacterSkin(root:Object3D,character:CharacterId) {
  root.traverse(object=>{if(isCharacterId(object.userData.characterSkin))object.visible=object.userData.characterSkin===character;});
}
