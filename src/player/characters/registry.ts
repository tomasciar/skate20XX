import {editionModels} from './editionModels.ts';
import type {BufferGeometry,Group,Mesh} from 'three';
import type {CharacterId} from './catalog.ts';
import {addClassicLook,addClassicLimb,addClassicShoe} from './models/localRiders.ts';

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

function helmetedRider(id:'boy'|'girl'):CharacterModel {
  return {
    profile:'skate-helmet',
    buildLook:({head,outfit})=>addClassicLook(head,outfit,id),
    buildLimb:(bone,group,kind)=>addClassicLimb(bone,group,id,kind),
    buildShoe:group=>addClassicShoe(group,id),
  };
}
export const CHARACTER_MODELS:Record<CharacterId,CharacterModel>={
  ...editionModels,
  boy:helmetedRider('boy'),
  girl:helmetedRider('girl'),
};
