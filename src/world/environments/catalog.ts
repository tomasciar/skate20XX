/** Environment definitions contain no riding-mode or seasonal branches. */
export type TreeStyle = 'pine' | 'cedar' | 'broadleaf' | 'birch' | 'autumn' | 'fruit' | 'snag';
type EnvironmentDefinition = {id:string;name:string;trees:readonly TreeStyle[]};

// This order is part of the seeded course. Append new environments to preserve existing IDs.
export const ENVIRONMENTS = [
  {id:'grove',name:'CEDAR GROVE',trees:['cedar','cedar','cedar','pine','broadleaf','birch']},
  {id:'village',name:'OLD TOWN',trees:['broadleaf','broadleaf','autumn','birch','pine']},
  {id:'ridge',name:'SUMMIT RIDGE',trees:['pine','pine','pine','snag','cedar']},
  {id:'farm',name:'GOLDEN ACRES',trees:['broadleaf','autumn','autumn','birch','fruit']},
  {id:'mill',name:'TIMBER MILL',trees:['pine','pine','cedar','snag','birch']},
] as const satisfies readonly EnvironmentDefinition[];

export type District = (typeof ENVIRONMENTS)[number]['id'];
export const DISTRICTS:readonly District[] = ENVIRONMENTS.map(environment=>environment.id);
export const DISTRICT_NAMES = Object.fromEntries(ENVIRONMENTS.map(environment=>[environment.id,environment.name])) as Record<District,string>;
export const ENVIRONMENT_BY_ID:ReadonlyMap<District,EnvironmentDefinition> = new Map(ENVIRONMENTS.map(environment=>[environment.id,environment]));
