/** Environment definitions contain no riding-mode or seasonal branches. */
export type TreeStyle = 'pine' | 'cedar' | 'broadleaf' | 'birch' | 'autumn' | 'fruit' | 'snag';
type EnvironmentDefinition = {id:string;name:string;trees:readonly TreeStyle[];ground:readonly [number,number,number]};

// This order is part of the seeded course. Append new environments to preserve existing IDs.
export const ENVIRONMENTS = [
  {id:'grove',name:'CEDAR GROVE',trees:['cedar','cedar','cedar','pine','broadleaf','birch'],ground:[0x3e6c49,0x55804c,0]},
  {id:'village',name:'OLD TOWN',trees:['broadleaf','broadleaf','autumn','birch','pine'],ground:[0x5f8a50,0x76985a,0]},
  {id:'ridge',name:'SUMMIT RIDGE',trees:['pine','pine','pine','snag','cedar'],ground:[0x7f8568,0x8e9072,0.7]},
  {id:'farm',name:'GOLDEN ACRES',trees:['broadleaf','autumn','autumn','birch','fruit'],ground:[0xb0a658,0x86a04e,0]},
  {id:'mill',name:'TIMBER MILL',trees:['pine','pine','cedar','snag','birch'],ground:[0x6c764a,0x82724f,0.15]},
  {id:'city',name:'DOWNTOWN',trees:['broadleaf','birch','autumn'],ground:[0x747d83,0x8a8d87,0]},
] as const satisfies readonly EnvironmentDefinition[];

export type District = (typeof ENVIRONMENTS)[number]['id'];
export const DISTRICTS:readonly District[] = ENVIRONMENTS.map(environment=>environment.id);
export const DISTRICT_NAMES = Object.fromEntries(ENVIRONMENTS.map(environment=>[environment.id,environment.name])) as Record<District,string>;
export const ENVIRONMENT_BY_ID:ReadonlyMap<District,EnvironmentDefinition> = new Map(ENVIRONMENTS.map(environment=>[environment.id,environment]));
