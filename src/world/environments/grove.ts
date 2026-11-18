import {makeBush, makeRocks} from '../props/nature.ts';
import {makeBench, makePaving, makePicnic} from '../props/furniture.ts';
import {makeCabin, makeShelter} from '../props/buildings.ts';
import {makeLogPile} from '../props/landmarks.ts';
import {facing,ALONG} from './layout.ts';
import type {LayoutContext} from './layout.ts';

export function populateGrove({rng,free,place,scatter,tree,forest,side}:LayoutContext) {
  const feature = rng(), s = side();
  if (feature < 0.28) {
    place(() => makeCabin(rng), s*23, 30+rng()*12, facing(s), 5.5);
    place(() => makeLogPile(rng), s*17.5, 22+rng()*4, ALONG, 1.8);
    place(() => makePaving(6,1.1), s*14.4, 36);
  } else if (feature < 0.5) {
    place(() => makeShelter(), s*15.6, 30+rng()*10, facing(s), 3.2);
  } else if (feature < 0.75) {
    for (const along of [26,34]) place(() => makePicnic(), s*(15+rng()*2), along+rng()*2, ALONG+(rng()-0.5)*0.4, 2);
    place(() => makeBench(), s*12.7, 44, facing(s), 1.5);
  }
  if (rng() < 0.5) { const b = -s; place(() => makeBench(), b*12.7, 14+rng()*40, facing(b), 1.5); }
  for (let i = 0; i < 7; i++) for (const t of [-1,1]) {
    const along = 5+i*9.5+rng()*3;
    for (const [near,reach] of [[12.6,5],[18.5,7]] as const) {
      const x = t*(near+rng()*reach);
      if (rng() > 0.15 && free(x, along, 2)) place(tree(), x, along, rng()*6, 1.3);
    }
  }
  scatter(12, () => makeBush(rng), 12.4, 32, 1);
  scatter(3, () => makeRocks(rng, 0.5), 14, 40, 2);
  forest(34);
}
