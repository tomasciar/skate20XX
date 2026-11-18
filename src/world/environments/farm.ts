import {makeBush} from '../props/nature.ts';
import {makeHouse, makeBarn} from '../props/buildings.ts';
import {makePaving, makeFence} from '../props/furniture.ts';
import {makeSilo, makeHayBale, makeWindpump} from '../props/landmarks.ts';
import {makeTractor} from '../props/vehicles.ts';
import {facing,ALONG} from './layout.ts';
import type {LayoutContext} from './layout.ts';

export function populateFarm({rng,free,place,scatter,tree,forest,side}:LayoutContext) {
  const stead = rng() < 0.5 ? side() : 0;
  for (const s of [-1,1]) {
    // Roadside fence, opened where the farm track meets the footpath.
    for (let i = 0; i < 8; i++) if (!(s === stead && (i === 3 || i === 4))) place(() => makeFence(8.75), s*13.1, 4.4+i*8.75, ALONG);
    if (s === stead) {
      place(() => makePaving(9,3.4,undefined), s*16, 35);
      place(() => makeHouse(rng), s*22.5, 17, facing(s), 6.4);
      place(() => makeBarn(rng), s*32, 52, facing(s), 8);
      place(() => makeSilo(rng), s*42.5, 44, 0, 2.6);
      if (rng() < 0.6) place(() => makeSilo(rng), s*42.5, 49.5, 0, 2.6);
      place(() => makeWindpump(), s*37, 10+rng()*6, facing(s), 2);
      if (rng() < 0.7) place(() => makeTractor(rng), s*19, 42+rng()*5, facing(s)+(rng()-0.5), 2.6);
      for (let i = 0; i < 4; i++) {
        const x = s*(16.5+rng()*7), along = 58+rng()*9;
        if (free(x, along, 1.1)) place(() => makeHayBale(rng), x, along, 0, 1);
      }
      place(tree('broadleaf', 1.4), s*29, 22, 0, 2.5);
    } else {
      const field = rng();
      if (field < 0.4) {
        // Orchard rows square to the road.
        for (let row = 0; row < 5; row++) for (let i = 0; i < 6; i++) place(tree('fruit'), s*(19+row*6.5), 6+i*11.5, rng()*6, 1.4);
      } else if (field < 0.75) {
        for (let i = 0; i < 10; i++) {
          const x = s*(18+rng()*48), along = 4+rng()*62;
          if (free(x, along, 1.6)) place(() => makeHayBale(rng), x, along, 0, 1.2);
        }
      } else {
        // Pasture split by a cross fence, with a shade tree.
        for (let i = 0; i < 5; i++) place(() => makeFence(9), s*(18.5+i*9), 35, 0);
        place(tree('broadleaf', 1.5), s*(24+rng()*20), 12+rng()*46, 0, 3);
      }
    }
  }
  scatter(6, () => makeBush(rng), 14, 60, 1.2);
  forest(12, 62);
}
