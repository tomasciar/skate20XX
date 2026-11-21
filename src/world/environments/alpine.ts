import {makeDistrictBuilding} from '../props/districtBuildings.ts';
import {makeRocks,makeBush} from '../props/nature.ts';
import {makeBench} from '../props/furniture.ts';
import {makeSkiRack} from '../props/districtStreetProps.ts';
import {facing} from './layout.ts';
import type {LayoutContext} from './layout.ts';

export function populateAlpine({index,rng,place,scatter,forest,tree}:LayoutContext) {
  const resort=Math.floor(index/3)%2===0;
  for(const side of [-1,1]) {
    if(resort)for(const along of [17,52])place(()=>makeDistrictBuilding(rng,'lodge'),side*(26+rng()*5),along,facing(side),10);
    else place(()=>makeDistrictBuilding(rng,side>0?'lift-station':'lodge'),side*35,35,facing(side),10);
    for(const along of [8,35,62])place(tree('pine',1.6),side*(15+rng()*4),along,0,2);
    place(()=>makeBench(),side*13,46,facing(side),1.7);
  }
  scatter(9,()=>makeRocks(rng,1.4),38,160,4);
  scatter(5,()=>makeBush(rng),15,70,1.5);scatter(5,makeSkiRack,15,35,1.5,false);
  forest(38,38,180,'pine');
}
