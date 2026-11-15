import {makeBush,makeRocks,makePaving,makeLookout,makeMast,makeHut,makeCairn,makeTurbine} from '../scenery.ts';
import {facing} from './layout.ts';
import type {LayoutContext} from './layout.ts';

export function populateRidge({rng,free,place,scatter,tree,forest,side}:LayoutContext) {
  const feature = rng(), s = side();
  if (feature < 0.22) place(() => makeLookout(), s*19.5, 28+rng()*14, facing(s), 4);
  else if (feature < 0.44) { place(() => makeHut(rng), s*21, 28+rng()*14, facing(s), 4.5); place(() => makePaving(7,1.1), s*15, 35); }
  else if (feature < 0.6) place(() => makeMast(), s*(46+rng()*24), 20+rng()*30, facing(s), 5);
  if (rng() < 0.32) for (let i = 0, count = 1+Math.floor(rng()*2); i < count; i++) {
    const t = side(); place(() => makeTurbine(rng), t*(115+rng()*80), 8+rng()*54, facing(t)+(rng()-0.5)*0.5, 6);
  }
  for (const t of [-1,1]) {
    if (rng() < 0.5) place(() => makeCairn(rng), t*12.5, 6+rng()*58, 0, 1);
    for (let i = 0; i < 5; i++) {
      const x = t*(13.5+rng()*9), along = 4+i*13+rng()*8;
      if (free(x, along, 2.4)) place(() => makeRocks(rng, 0.6+rng()*0.6), x, along, rng()*6, 2);
    }
  }
  scatter(7, () => makeRocks(rng, 1.6+rng()*1.6), 30, 125, 5);
  scatter(8, tree(), 13, 26, 1.6);
  scatter(8, () => makeBush(rng), 12.5, 40, 1);
  forest(14);
}
