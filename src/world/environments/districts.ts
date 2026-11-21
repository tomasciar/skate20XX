import {makeSign} from '../props/furniture.ts';
import {ENVIRONMENT_LAYOUTS} from './registry.ts';
import {createLayoutContext} from './layout.ts';
import type {DistrictContext} from './layout.ts';
import {branchRoadsForChunk,branchRoadX} from '../planning/branchRoads.ts';
import {seededRandom,CHUNK_LENGTH} from '../planning/generation.ts';
import {makeDistrictBuilding} from '../props/districtBuildings.ts';
import type {DistrictBuilding} from '../props/districtBuildings.ts';
import {facing} from './layout.ts';
export type {Plant,DistrictContext} from './layout.ts';

/** Common placement, snow compatibility, and incremental construction for every environment. */
export function* populateDistrict(context:DistrictContext):Generator<void> {
  const layout=createLayoutContext(context);
  if(context.entering)layout.place(()=>makeSign(context.district,context.index),13.1,2.6,0,3);
  ENVIRONMENT_LAYOUTS[context.district](layout);
  for(const road of branchRoadsForChunk(context.index)) {
    const along=context.index*CHUNK_LENGTH+35,center=branchRoadX(road,along);
    if(Math.abs(center)<45 || along<road.start+60 || along>road.end-60)continue;
    const rng=seededRandom(road.seed^Math.imul(context.index,7919));
    const kind:DistrictBuilding=context.district==='harbor'?'boathouse':context.district==='canyon'?'adobe':context.district==='alpine'?'lodge':context.district==='gardens'?'courtyard':rng()<.5?'boathouse':'service-station';
    layout.place(()=>makeDistrictBuilding(rng,kind),center+road.side*(road.width/2+35),35,facing(road.side),10);
  }
  yield* layout.build();
}
