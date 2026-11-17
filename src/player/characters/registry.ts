import type {BufferGeometry,Group,Mesh} from 'three';
import type {CharacterId} from './catalog.ts';
import {addClassicLook,addClassicLimb,addClassicShoe,addKickHips} from './models/classicRiders.ts';
import type {ClassicRider} from './models/classicRiders.ts';
import {addCartoonHead,addCartoonOutfit,addCartoonLimbDetails,addCartoonShorts,addCartoonShoeDetails,addFinnSword} from './models/cartoonCharacters.ts';
import type {CartoonRider} from './models/cartoonCharacters.ts';
import {addHumanHead,addHumanOutfit,addHumanLimbDetails,addHumanShoeDetails} from './models/humanCharacters.ts';
import type {HumanRider} from './models/humanCharacters.ts';
import {addPeterHead,addPeterOutfit,addPeterLimbDetails,addPeterShoeDetails} from './models/peterCharacter.ts';
import {addAnimeGuestHead,addAnimeGuestOutfit,addSasukeShorts,addAnimeGuestLimb,addAnimeGuestShoe} from './models/animeGuests.ts';
import type {AnimeGuest} from './models/animeGuests.ts';
import {addSpiderHead,addSpiderOutfit,addSpiderLimb,addSpiderShoe} from './models/spiderMan.ts';
import {addMichaelHead,addMichaelOutfit,addMichaelLimb,addMichaelShoe} from './models/michaelJackson.ts';
import {sahurHeadGeometry,addSahurHead,addSahurFoot,addSahurBat,addSahurHips,addSahurShoulders,SAHUR_PARTS} from './models/sahur.ts';

type Surface=(x:number,y:number)=>number;
export type CharacterLookContext={head:Group;outfit:Group;front:Surface;back:Surface;width:number;depth:number};
export type CharacterLimb='upperarm'|'forearm'|'shin';
export type CharacterBodyPart='chest'|'upperarm'|'forearm'|'thigh'|'shin'|'hand'|'pelvis'|'sleeve';
export type CharacterPartAppearance={geometry?:(mesh:Mesh)=>BufferGeometry;hidden?:boolean};
export type CharacterModel={
  profile:string;
  /** Fresh authoring geometry: assembly bakes and disposes it. Rig-part overrides are cached/immutable. */
  headGeometry?:()=>BufferGeometry;
  rigParts?:Partial<Record<CharacterBodyPart,CharacterPartAppearance>>;
  vertexColors?:boolean;
  hideFootwear?:boolean;
  ragdoll?:{
    torso?:{half:readonly[number,number,number];center:readonly[number,number,number]};
    head?:{radius:number;length?:number;center:readonly[number,number,number]};
    matchLimbWidths?:boolean;
  };
  /** Optional cleanup runs after rigid details have been baked into shared vertex-colour batches. */
  buildLook:(context:CharacterLookContext)=>void|(()=>void);
  buildLimb:(bone:Mesh,group:Group,kind:CharacterLimb,side:number)=>void;
  buildShoe:(group:Group)=>void;
  buildThigh?:(bone:Mesh)=>void;
  buildHips?:(group:Group)=>void;
  buildHand?:(hand:Mesh,side:number)=>void;
};

function classic(id:ClassicRider,profile:string):CharacterModel {
  return {
    profile,
    buildLook:({head,outfit})=>addClassicLook(head,outfit,id),
    buildLimb:(bone,group,kind,side)=>addClassicLimb(bone,group,id,kind,side),
    buildShoe:group=>addClassicShoe(group,id),
    ...(id==='kick'?{buildHips:addKickHips}:{}),
  };
}
function cartoon(id:CartoonRider,profile:string):CharacterModel {
  return {
    profile,
    buildLook:({head,outfit,front})=>{addCartoonHead(head,id);addCartoonOutfit(outfit,id,front);},
    buildLimb:(_bone,group,kind)=>addCartoonLimbDetails(group,id,kind),
    buildThigh:bone=>addCartoonShorts(bone,id),
    buildShoe:group=>addCartoonShoeDetails(group,id),
    ...(id==='finn'?{buildHand:(hand:Mesh,side:number)=>{if(side===1)addFinnSword(hand);}}:{}),
  };
}
function human(id:HumanRider,profile:string):CharacterModel {
  return {
    profile,
    buildLook:({head,outfit,front})=>{addHumanHead(head,id);addHumanOutfit(outfit,id,front);},
    buildLimb:(_bone,group,kind)=>addHumanLimbDetails(group,id,kind),
    buildShoe:group=>addHumanShoeDetails(group,id),
  };
}
function anime(id:AnimeGuest,profile:string):CharacterModel {
  return {
    profile,
    buildLook:({head,outfit,front,back})=>{addAnimeGuestHead(head,id);addAnimeGuestOutfit(outfit,id,front,back);},
    buildLimb:(_bone,group,kind,side)=>addAnimeGuestLimb(group,id,kind,side),
    buildShoe:group=>addAnimeGuestShoe(group,id),
    ...(id==='sasuke'?{buildThigh:addSasukeShorts}:{}),
  };
}

/** Exhaustive roster: model and attachment dispatch belongs here, never in the animated rider rig. */
export const CHARACTER_MODELS:Record<CharacterId,CharacterModel>={
  boy:classic('boy','skate-helmet'),
  girl:classic('girl','skate-helmet'),
  goku:classic('goku','swept-spikes'),
  naruto:classic('naruto','layered-spikes'),
  kick:classic('kick','full-stunt-helmet'),
  finn:cartoon('finn','bear-ear-hood'),
  bart:cartoon('bart','serrated-crown'),
  shaggy:human('shaggy','scruffy-fringe'),
  light:human('light','swept-fringe'),
  peter:{
    profile:'round-glasses-cleft-chin',
    buildLook:({head,outfit,front,width,depth})=>{addPeterHead(head);addPeterOutfit(outfit,front,width,depth);},
    buildLimb:(_bone,group,kind)=>addPeterLimbDetails(group,kind),
    buildShoe:addPeterShoeDetails,
  },
  spiderman:{
    profile:'webbed-mask',
    buildLook:({head,outfit,front,back})=>{addSpiderHead(head);addSpiderOutfit(outfit,front,back);},
    buildLimb:(_bone,group,kind,side)=>addSpiderLimb(group,kind,side),
    buildShoe:addSpiderShoe,
  },
  sasuke:anime('sasuke','rear-fan-long-bangs'),
  mj:{
    profile:'fedora-curls',
    buildLook:({head,outfit,front,back})=>{addMichaelHead(head);addMichaelOutfit(outfit,front,back);},
    buildLimb:(_bone,group,kind,side)=>addMichaelLimb(group,kind,side),
    buildShoe:addMichaelShoe,
  },
  onizuka:anime('onizuka','bleached-crop'),
  sahur:{
    profile:'wooden-log',
    headGeometry:sahurHeadGeometry,
    rigParts:SAHUR_PARTS,
    vertexColors:true,
    hideFootwear:true,
    ragdoll:{torso:{half:[.14,.23,.14],center:[0,.255,0]},
      head:{radius:.14,length:.12,center:[0,.087,0]},matchLimbWidths:true},
    buildLook:({head,outfit})=>{addSahurHead(head);addSahurShoulders(outfit);},
    buildLimb:()=>{},
    buildShoe:addSahurFoot,
    buildHips:addSahurHips,
    buildHand:(hand,side)=>{if(side===1)addSahurBat(hand);},
  },
};
