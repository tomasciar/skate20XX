import {makeDistrictBuilding} from '../props/districtBuildings.ts';
import {makeBush,makeHedge} from '../props/nature.ts';
import {makeBench,makePlanter} from '../props/furniture.ts';
import {makeGardenLantern} from '../props/districtStreetProps.ts';
import {facing,ALONG} from './layout.ts';
import type {LayoutContext} from './layout.ts';

export function populateGardens({index,rng,place,scatter,forest,tree}:LayoutContext) {
  const court=Math.floor(index/2)%3;
  for(const side of [-1,1]) {
    if(court!==1)for(const along of [17,52])place(()=>makeDistrictBuilding(rng,'courtyard'),side*26,along,facing(side),10);
    else place(()=>makeDistrictBuilding(rng,'conservatory'),side*33,35,facing(side),10);
    for(const along of [8,30,60]) {
      place(tree('fruit',1.4),side*15,along,0,2);
      if(along===30)place(()=>makeBench(),side*19.5,along,facing(side),1.8);
    }
    for(const along of [7,63])place(()=>makeHedge(8),side*45,along,ALONG,1.5);
    place(()=>makePlanter(rng),side*17.5,45,0,1.5);
    if(court===2)place(()=>makeDistrictBuilding(rng,'conservatory'),side*84,35,facing(side),10);
  }
  scatter(8,()=>makeBush(rng),25,125,1.2);scatter(6,makeGardenLantern,15,58,1.2);
  forest(32,47,145,'fruit');forest(12,80,190,'broadleaf');
}
