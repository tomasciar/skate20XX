import type {CharacterId} from './catalog.ts';
const standard={
  stocky:false,legStyle:'standard',thighRadius:1,shinRadius:1,
  hideSleeve:false,scaleSleeve:false,shirtShoulders:false,sole:0xece1c7,
} as const;
export function rigTraits(_id:CharacterId) {return standard;}
