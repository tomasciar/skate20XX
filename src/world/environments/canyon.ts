import {makeDistrictBuilding,makeMesa} from '../props/districtBuildings.ts';
import {makeBush,makeRocks,makeCairn} from '../props/nature.ts';
import {makeCactus} from '../props/districtStreetProps.ts';
import {facing} from './layout.ts';
import type {LayoutContext} from './layout.ts';

export function populateCanyon({index,rng,place,scatter,forest,tree}:LayoutContext) {
  const town=Math.floor(index/3)%3===0;
  for(const side of [-1,1]) {
    if(town)for(const along of [17,52])place(()=>makeDistrictBuilding(rng,'adobe'),side*25,along,facing(side),9);
    else if(side===(index%2?1:-1))place(()=>makeDistrictBuilding(rng,'service-station'),side*28,35,facing(side),12);
    else place(()=>makeDistrictBuilding(rng,'adobe'),side*45,40,facing(side),9);
    place(()=>makeCairn(rng),side*13.6,12,0,1);
    for(const along of [13,49])place(()=>makeMesa(rng),side*(80+rng()*95),along,rng(),12);
  }
  scatter(10,()=>makeBush(rng),15,100,1.3);scatter(8,makeCactus,15,100,1.3);
  scatter(14,()=>makeRocks(rng,.7),16,135,2);
  scatter(10,tree('snag',.8),25,150,1.8);forest(8,90,190,'pine');
}
