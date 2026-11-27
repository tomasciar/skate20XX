import { readGameValue } from '../../storage.ts';
import type {RideMode} from '../../mode.ts';

import {editionRiders,editionPalettes,editionBuilds} from './edition.ts';
import {BASE_BUILD} from './buildDefaults.ts';
export {hasHeldWeapons,characterHasShorts,characterHasCartoonHands} from './edition.ts';

export const CHARACTERS=[
  {id:'boy',name:'Boy'},
  {id:'girl',name:'Girl'},
  ...editionRiders,
] as const;
export type CharacterId=(typeof CHARACTERS)[number]['id'];
export const CHARACTER_STORAGE_KEY='skate20XX.character';
type StorageLike=Pick<Storage,'getItem'|'setItem'>;
export function isCharacterId(value:unknown):value is CharacterId {return CHARACTERS.some(character=>character.id===value);}
export function loadCharacter(storage?:StorageLike):CharacterId {
  try {const value=readGameValue(storage ?? globalThis.localStorage, CHARACTER_STORAGE_KEY);return isCharacterId(value)?value:'boy';}
  catch {return 'boy';}
}
export function saveCharacter(character:CharacterId,storage?:StorageLike) {
  try {(storage ?? globalThis.localStorage).setItem(CHARACTER_STORAGE_KEY,character);}catch { /* Storage may be disabled. */ }
}

export type CharacterPalette={skin:number;shirt:number;pants:number;arms:number;sleeves:number;shoes:number;helmet:number;hair:number;accent:number;gloves:number;knees:number};
const PALETTES:Record<CharacterId,CharacterPalette>={
  ...editionPalettes,
  boy:{skin:0xc48a65,shirt:0x267a79,pants:0x293b4a,arms:0xc48a65,sleeves:0x267a79,shoes:0x253035,helmet:0xef7846,hair:0x493228,accent:0xef7846,gloves:0x202e32,knees:0x202e32},
  girl:{skin:0xc48a65,shirt:0x984b79,pants:0x263e52,arms:0xc48a65,sleeves:0x984b79,shoes:0x315563,helmet:0x58c1b9,hair:0x493028,accent:0x58c1b9,gloves:0x25333b,knees:0x25333b},
};
export function characterPalette(character:CharacterId,mode:RideMode):CharacterPalette {
  const palette=PALETTES[character];
  if(mode==='skate')return {...palette};
  if(character==='boy')return {...palette,shirt:0xe35e42,arms:0xe35e42,sleeves:0xe35e42,pants:0x233c56,helmet:0x315e82};
  if(character==='girl')return {...palette,shirt:0x984b79,arms:0x984b79};
  return {...palette};
}

type CharacterBuild=typeof BASE_BUILD;
const BUILDS:Record<CharacterId,CharacterBuild>={
  ...editionBuilds,
  boy:{...BASE_BUILD},girl:{...BASE_BUILD,chestWidth:.95,thigh:.95},
};
/** Cosmetic proportions are independent of the board and the riding collision solver. */
export function characterProportions(character:CharacterId) {
  return BUILDS[character];
}
