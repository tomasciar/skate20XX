import type {Object3D} from 'three';
import {Mesh} from 'three';
import type {RideMode} from './mode.ts';
import {characterLegGeometry,characterHandGeometry,characterTorsoGeometry} from './player/modelGeometry.ts';

export const CHARACTERS=[
  {id:'boy',name:'Boy'},
  {id:'girl',name:'Girl'},
  {id:'goku',name:'Goku'},
  {id:'naruto',name:'Naruto'},
  {id:'kick',name:'Kick Buttowski'},
  {id:'finn',name:'Finn'},
  {id:'bart',name:'Bart Simpson'},
  {id:'shaggy',name:'Shaggy Rogers'},
  {id:'light',name:'Light Yagami'},
  {id:'peter',name:'Peter Griffin'},
  {id:'spiderman',name:'Spider-Man'},
  {id:'sasuke',name:'Sasuke Uchiha'},
  {id:'mj',name:'Michael Jackson'},
  {id:'onizuka',name:'Eikichi Onizuka'},
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
  finn:{skin:0xf6cc95,shirt:0x40bce9,pants:0x1e76c5,arms:0xf6cc95,sleeves:0x40bce9,shoes:0x19232a,helmet:0xf9faf0,hair:0xf4d758,accent:0x72ad47,gloves:0xf6cc95,knees:0xf6cc95},
  bart:{skin:0xffd62a,shirt:0xef532d,pants:0x2488c7,arms:0xffd62a,sleeves:0xef532d,shoes:0x2488c7,helmet:0xffd62a,hair:0xffd62a,accent:0xeff4ee,gloves:0xffd62a,knees:0xffd62a},
  shaggy:{skin:0xefc28e,shirt:0x97b94a,pants:0x78452e,arms:0xefc28e,sleeves:0x97b94a,shoes:0x28251f,helmet:0x97b94a,hair:0x825d35,accent:0x6a9130,gloves:0xefc28e,knees:0x78452e},
  light:{skin:0xdfb294,shirt:0xc3a678,pants:0x524238,arms:0xc3a678,sleeves:0xc3a678,shoes:0x292626,helmet:0xc3a678,hair:0x6f452f,accent:0x96323c,gloves:0xdfb294,knees:0x524238},
  peter:{skin:0xefc69e,shirt:0xf7f6eb,pants:0x377548,arms:0xefc69e,sleeves:0xf7f6eb,shoes:0x70492f,helmet:0xf7f6eb,hair:0x75452b,accent:0xc6a14c,gloves:0xefc69e,knees:0x377548},
  spiderman:{skin:0xcf303b,shirt:0x20579d,pants:0x20579d,arms:0x20579d,sleeves:0xcf303b,shoes:0xcf303b,helmet:0xcf303b,hair:0x20242d,accent:0xcf303b,gloves:0xcf303b,knees:0x20579d},
  sasuke:{skin:0xe7c09c,shirt:0x20345c,pants:0xf4f1e8,arms:0xe7c09c,sleeves:0x20345c,shoes:0x243556,helmet:0x20345c,hair:0x1c202d,accent:0xb73e42,gloves:0xe7c09c,knees:0xe7c09c},
  mj:{skin:0xbc8767,shirt:0xf0e9d8,pants:0xf0e9d8,arms:0xf0e9d8,sleeves:0xf0e9d8,shoes:0x20232b,helmet:0xf0e9d8,hair:0x211d24,accent:0x5c87aa,gloves:0xbc8767,knees:0xf0e9d8},
  onizuka:{skin:0xcd946f,shirt:0xf3f1e5,pants:0x292b2d,arms:0xcd946f,sleeves:0xf3f1e5,shoes:0x72523c,helmet:0xf3f1e5,hair:0xe5bd45,accent:0x32383d,gloves:0xcd946f,knees:0x292b2d},
};
export function characterPalette(character:CharacterId,mode:RideMode):CharacterPalette {
  const palette=PALETTES[character];
  if(mode==='skate')return {...palette};
  if(character==='boy')return {...palette,shirt:0xe35e42,arms:0xe35e42,sleeves:0xe35e42,pants:0x233c56,helmet:0x315e82};
  if(character==='girl')return {...palette,shirt:0x984b79,arms:0x984b79};
  return {...palette};
}

export function characterHasShorts(character:CharacterId){return character==='finn'||character==='bart'||character==='sasuke';}
export function characterHasCartoonHands(character:CharacterId){return character==='finn'||character==='bart'||character==='peter';}
const BASE_BUILD={bodyScale:1,legScale:1,armScale:1,chestWidth:1,chestDepth:.65,upperarm:1,forearm:1,shoulder:1,
  thigh:1,shin:1,knee:1,elbow:1,hipDrop:0,headHeight:.53,hand:1,shoulderSpan:1,hipWidth:1,pelvisWidth:1,pelvisDepth:1};
type CharacterBuild=typeof BASE_BUILD;
const BUILDS:Record<CharacterId,CharacterBuild>={
  boy:{...BASE_BUILD},girl:{...BASE_BUILD,chestWidth:.95,thigh:.95},
  goku:{...BASE_BUILD,chestWidth:1.22,chestDepth:.78,upperarm:1.32,forearm:1.2,shoulder:1.24,thigh:1.04,knee:.9},
  naruto:{...BASE_BUILD,thigh:.94,knee:.84},
  kick:{...BASE_BUILD,bodyScale:.76,legScale:.799,chestWidth:1.18,chestDepth:.858,upperarm:1.1,forearm:1.1,shoulder:1.08,
    thigh:1.357,shin:1.311,knee:1.242,hipDrop:.16,headHeight:.57},
  finn:{...BASE_BUILD,chestWidth:.94,chestDepth:.60,upperarm:.72,forearm:.72,shoulder:.82,thigh:.83,shin:.84,knee:.58,elbow:.65},
  bart:{...BASE_BUILD,bodyScale:.82,legScale:.747,armScale:.9,chestWidth:1.05,chestDepth:.70,upperarm:1.173,forearm:1.173,shoulder:1.10,
    thigh:1.15,shin:1.15,knee:.7475,elbow:.966,hipDrop:.16,headHeight:.55,hand:1.08},
  shaggy:{...BASE_BUILD,bodyScale:1.04,chestWidth:.87,chestDepth:.58,upperarm:.78,forearm:.78,shoulder:.84,thigh:.86,shin:1.03,knee:.75,elbow:.70,hipDrop:-.025,headHeight:.565},
  light:{...BASE_BUILD,chestWidth:.98,chestDepth:.65,upperarm:.95,forearm:.95,shoulder:.97,thigh:.98,shin:.98,knee:.70,elbow:.83},
  peter:{...BASE_BUILD,bodyScale:.98,legScale:.86,chestWidth:1.47,chestDepth:1.05,upperarm:1.48,forearm:1.48,shoulder:1.32,
    thigh:1.49,shin:1.53,knee:1.25,elbow:1.30,hipDrop:.12,headHeight:.605,hand:1.25,shoulderSpan:1.30,hipWidth:1.30,pelvisWidth:1.45,pelvisDepth:1.30},
  spiderman:{...BASE_BUILD,chestWidth:1.12,chestDepth:.72,upperarm:1.10,forearm:1.08,shoulder:1.08,thigh:.94,shin:.92,knee:.86,hand:1.30},
  sasuke:{...BASE_BUILD,bodyScale:.96,legScale:.96,hipDrop:.04,headHeight:.54,chestWidth:.97,thigh:.94,shin:.96,knee:.65},
  mj:{...BASE_BUILD,chestWidth:.94,chestDepth:.62,upperarm:.94,forearm:.93,shoulder:.95,thigh:.97,shin:.96,knee:.70,elbow:.82,headHeight:.535},
  onizuka:{...BASE_BUILD,bodyScale:1.09,chestWidth:1.16,chestDepth:.72,upperarm:1.18,forearm:1.12,shoulder:1.14,thigh:1.03,shin:1.01,knee:.96,headHeight:.54},
};
/** Cosmetic proportions are independent of the board and the riding collision solver. */
export function characterProportions(character:CharacterId) {
  return BUILDS[character];
}
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
