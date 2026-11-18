/** Environment definitions contain no riding-mode or seasonal branches. */
export type TreeStyle = 'pine' | 'cedar' | 'broadleaf' | 'birch' | 'autumn' | 'fruit' | 'snag';
type EnvironmentDefinition = {id:string;name:string;trees:readonly TreeStyle[];ground:readonly [number,number,number];paint?:readonly number[]};

// This order is part of the seeded course. Append new environments to preserve existing IDs.
export const ENVIRONMENTS = [
  {id:'grove',name:'CEDAR GROVE',trees:['cedar','pine','broadleaf','autumn','birch','broadleaf'],ground:[0x3e6c49,0x55804c,0],paint:[0xa78864,0x789083,0xc3ac8b,0x718381,0xb78f72,0x829568]},
  {id:'village',name:'OLD TOWN',trees:['broadleaf','broadleaf','autumn','birch','pine'],ground:[0x5f8a50,0x76985a,0]},
  {id:'ridge',name:'SUMMIT RIDGE',trees:['pine','pine','pine','snag','cedar'],ground:[0x7d934a,0xa3a354,0.35],paint:[0x819294,0xa49780,0x79856e,0xb6ac91,0x8f7971,0x71818c]},
  {id:'farm',name:'GOLDEN ACRES',trees:['broadleaf','autumn','autumn','birch','fruit'],ground:[0xb0a658,0x86a04e,0],paint:[0xae5347,0x7798aa,0xc0b17c,0xd6c6a6,0x668573,0xa78063,0x9a846d]},
  {id:'mill',name:'TIMBER MILL',trees:['pine','pine','cedar','snag','birch'],ground:[0x6c764a,0x82724f,0.15],paint:[0x62828e,0xa87758,0x7e8c81,0xb79565,0x7a8994,0x987361]},
  {id:'city',name:'DOWNTOWN',trees:['broadleaf','birch','autumn'],ground:[0x73934f,0xa8ac58,0]},
] as const satisfies readonly EnvironmentDefinition[];

export type District = (typeof ENVIRONMENTS)[number]['id'];
export const DISTRICTS:readonly District[] = ENVIRONMENTS.map(environment=>environment.id);
export const DISTRICT_NAMES = Object.fromEntries(ENVIRONMENTS.map(environment=>[environment.id,environment.name])) as Record<District,string>;
export const ENVIRONMENT_BY_ID:ReadonlyMap<District,EnvironmentDefinition> = new Map(ENVIRONMENTS.map(environment=>[environment.id,environment]));
