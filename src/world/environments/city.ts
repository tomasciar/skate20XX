import {makeCar,makeBench,makePlanter,makeBusStop,makePaving,makeLamp} from '../scenery.ts';
import {makeCityBuilding,makeCityHydrant,makeCityBin,makeParkingMeter} from './cityProps.ts';
import {facing,ALONG} from './layout.ts';
import type {LayoutContext} from './layout.ts';

/** Terraced street frontages, pocket plazas, and a second skyline row share the existing road. */
export function populateCity({index,rng,place,tree}:LayoutContext) {
  const plazaSide=index%2?1:-1;
  for(const side of [-1,1]) {
    for(const along of [10,35,60]) {
      if(side===plazaSide && along===35) {
        place(()=>makePaving(11,9),side*20.5,along,ALONG,7);
        place(()=>makeBench(),side*16,along-3.5,facing(side),1.6);
        place(()=>makeBench(),side*16,along+3.5,facing(side),1.6);
        for(const offset of [-3.6,3.6])place(()=>makePlanter(rng),side*24,along+offset,0,1.3);
        place(tree('broadleaf',1.1),side*24,along,0,1.5);
      } else {
        const style=rng()<0.3?'office':rng()<0.3?'shop':'apartment';
        place(()=>makeCityBuilding(rng,style),side*21,along,facing(side),7.5);
        // A small paved forecourt joins each storefront to the roadside footpath.
        place(()=>makePaving(4.4,7.5),side*13.8,along,0);
      }
      place(()=>makeCar(rng),side*13.15,along+7,0,2.4);
      place(()=>makeParkingMeter(),side*11.9,along+7,facing(side),0.3);
    }
    for(const along of [5,28,51])place(()=>makeLamp(side,rng),side*9,along);
    for(const along of [19,47]) {
      place(()=>makeCityBin(),side*12.2,along,facing(side),0.5);
      place(tree('birch',0.85),side*14.1,along+3,0,1.4);
    }
    place(()=>makeCityHydrant(),side*12.1,24,0,0.5);
    // Big forms behind the street wall replace the rural forest rather than adding a dense object layer.
    for(const along of [16,54])place(()=>makeCityBuilding(rng,'tower'),side*(49+rng()*8),along,facing(side),10);
  }
  place(()=>makeBusStop(),-plazaSide*12.6,36,facing(-plazaSide),1.8);
}
