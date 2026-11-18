import {makeBush,makeHouse,makeShop,makeChapel,makeCar,makeBench,makePlanter,makeBusStop,makeWell,makeShed,makeHedge,makePaving,makeFence,makeLamp} from '../scenery.ts';
import {facing,ALONG} from './layout.ts';
import type {LayoutContext} from './layout.ts';
import {makeArchitecture} from './architecture.ts';

export function populateVillage({index,rng,free,place,scatter,tree,forest,side}:LayoutContext) {
  let chapel = index%3 !== 0;
  for (const s of [-1,1]) {
    for (const along of s < 0 ? [12,47] : [29.5,64.5]) place(() => makeLamp(s, rng), s*9, along);
    for (const lot of [12,34,56]) {
      const roll = rng();
      if (roll < 0.14 && !chapel) {
        chapel = true;
        place(() => makeChapel(rng), s*23.8, lot, facing(s), 9);
        place(() => makePaving(5.6,2), s*14.2, lot);
        for (const d of [-7,7]) place(tree('cedar'), s*17, lot+d, 0, 1.5);
      } else if (roll < 0.34) {
        place(() => makeShop(rng), s*19.3, lot, facing(s), 6.5);
        place(() => makePaving(4.6,8), s*13.7, lot);
        place(() => makePlanter(rng), s*14.2, lot+(rng() < 0.5 ? -5.5 : 5.5), 0, 1.3);
      } else if (roll < 0.48) {
        // Pocket park: a well ringed by benches that look back at the street.
        place(() => makeWell(), s*19, lot, facing(s), 2.2);
        for (const d of [-4.5,4.5]) place(() => makeBench(), s*15, lot+d, facing(s), 1.6);
        place(() => makePlanter(rng), s*23.5, lot, 0, 1.4);
        for (const d of [-7.5,7.5]) place(tree(rng() < 0.5 ? 'autumn' : 'broadleaf'), s*(22+rng()*4), lot+d, rng()*6, 1.6);
        place(() => makePaving(7,1.4), s*14.9, lot);
      } else {
        const variant=(index+lot+(s>0?1:0))%4;
        place(() => variant===0?makeArchitecture(rng,'rowhouse'):variant===1?makeArchitecture(rng,'arcade'):makeHouse(rng), s*20.3, lot, facing(s), 6.2);
        place(() => makePaving(5,1.3), s*13.9, lot);
        const drive = rng() < 0.55 ? side() : 0;
        for (const d of [-1,1]) {
          if (d === drive) {
            place(() => makePaving(7,3), s*15, lot+d*7.4);
            place(() => makeCar(rng), s*17.4, lot+d*7.4, facing(s), 2.6);
          } else place(() => makeHedge(6.4), s*15.3, lot+d*6.3, ALONG, 1);
        }
        if (rng() < 0.3) place(() => makeShed(rng), s*30.5, lot+4, facing(s), 2.2);
        for (let i = 0, count = 1+Math.floor(rng()*2); i < count; i++) {
          const x = s*(28+rng()*9), along = lot-8+rng()*16;
          if (free(x, along, 2)) place(tree(), x, along, rng()*6, 1.6);
        }
      }
    }
    // Street trees stand on the lot lines, clear of doors and driveways.
    for (const along of [1,23,45]) if (free(s*13.3, along, 1.5)) place(tree(rng() < 0.3 ? 'autumn' : 'broadleaf'), s*13.3, along, rng()*6, 1.2);
  }
  if (rng() < 0.4) { const s = side(); if (free(s*12.7, 26.5, 1.8)) place(() => makeBusStop(), s*12.7, 26.5, facing(s), 1.8); }
  // Outlying cottages on the hillside, still turned toward the road.
  for (const s of [-1,1]) for (let i = 0; i < 2; i++) {
    const x = s*(44+rng()*34), along = 10+i*34+rng()*14;
    place(() => makeHouse(rng), x, along, facing(s), 7);
    if (rng() < 0.6) place(() => makeFence(10), x-s*7, along, ALONG, 1);
  }
  scatter(10, () => makeBush(rng), 26, 60, 1.2);
  forest(16, 34);
}
