import {makeDistrictBuilding,makeHarborCrane} from '../props/districtBuildings.ts';
import {makeBush} from '../props/nature.ts';
import {makeBench,makeLamp,makePlanter} from '../props/furniture.ts';
import {makeCar} from '../props/vehicles.ts';
import {makeHarborCrate,makeBollard} from '../props/districtStreetProps.ts';
import {facing} from './layout.ts';
import type {LayoutContext} from './layout.ts';

export function populateHarbor({index,rng,place,scatter,forest,tree}:LayoutContext) {
  const working=(Math.floor(index/2)%3)!==1;
  for(const side of [-1,1]) {
    for(const along of [17,52]) {
      const kind=working&&side>0?'terminal':'boathouse';
      place(()=>makeDistrictBuilding(rng,kind),side*(24+rng()*6),along,facing(side),10);
      place(()=>makeLamp(side,rng),side*12.5,along+11,0,1);
      if(!working)place(()=>makeBench(),side*15,along-8,facing(side),1.8);
    }
    place(()=>makePlanter(rng),side*16,34,0,1.5);
  }
  if(working) {
    place(()=>makeHarborCrane(rng),73,36,facing(1),12);
    place(()=>makeDistrictBuilding(rng,'boathouse'),-78,36,facing(-1),9);
  }
  scatter(4,()=>makeCar(rng),15,19,2.5,false);
  scatter(6,()=>makeBush(rng),32,130,1.5);
  scatter(4,makeHarborCrate,32,95,1.3);scatter(2,makeBollard,14,19,.8,false);
  forest(23,38,140);scatter(8,tree('broadleaf',.9),14,19,1.5);
}
