import {makeBush, makeStump} from '../props/nature.ts';
import {makePaving, makeYardFence, makeLamp} from '../props/furniture.ts';
import {makeLogPile, makeLumberStack, makeTank, makeStack, makePowerPole} from '../props/landmarks.ts';
import {makeSawmill, makeWarehouse} from '../props/buildings.ts';
import {makeLogTruck} from '../props/vehicles.ts';
import {facing,ALONG} from './layout.ts';
import type {LayoutContext} from './layout.ts';
import {makeArchitecture} from '../structures/architecture.ts';

export function populateMill({index,rng,free,place,scatter,tree,forest}:LayoutContext) {
  const yard = index%2 ? 1 : -1, clear = -yard;
  for (const along of [10,45]) place(() => makePowerPole(), clear*12.9, along, 0, 0.8);
  for (const along of [27,62]) place(() => makeLamp(yard, rng), yard*9, along);
  for (let i = 0; i < 8; i++) if (i !== 3 && i !== 4) place(() => makeYardFence(8.75), yard*13.1, 4.4+i*8.75, ALONG);
  place(() => makePaving(9,7,undefined), yard*16, 35);
  if (rng() < 0.5) place(() => makeSawmill(rng), yard*21.5, 17, facing(yard), 8.5);
  else place(() => index%2?makeArchitecture(rng,'warehouse'):makeWarehouse(rng), yard*22.5, 17, facing(yard), 8.5);
  if (rng() < 0.55) place(() => makeLogTruck(rng), yard*17.2, 37+rng()*3, rng() < 0.5 ? 0 : Math.PI, 4.2);
  for (const along of [48,55,62]) place(() => makeLogPile(rng, 0.7, 6), yard*18.5, along+rng(), (rng()-0.5)*0.2, 3.2);
  for (const along of [47,52.5,58,63.5]) if (rng() < 0.8) place(() => makeLumberStack(rng), yard*27.5, along, ALONG, 2);
  if (rng() < 0.5) place(() => makeTank(rng), yard*33, 8+rng()*4, 0, 2.6);
  if (rng() < 0.35) place(() => makeStack(), yard*34, 26+rng()*4, 0, 2.2);
  // The far side has been felled near the road; the plantation still stands in rows beyond.
  for (let i = 0; i < 22; i++) {
    const x = clear*(13.5+rng()*26), along = 2+rng()*66;
    if (free(x, along, 0.9)) place(() => makeStump(rng), x, along, 0, 0.6);
  }
  for (const along of [20,50]) if (rng() < 0.7) place(() => makeLogPile(rng, 0.5, 3.4), clear*(15+rng()*4), along+rng()*6, ALONG, 2.2);
  for (let row = 0; row < 5; row++) for (let i = 0; i < 9; i++)
    place(tree(rng() < 0.9 ? 'pine' : 'snag', 1.2), clear*(44+row*7+(i%2)*2), 4+i*7.6, rng()*6, 1.5);
  scatter(6, tree('snag'), 14, 40, 1.4);
  scatter(8, () => makeBush(rng), 13, 44, 1);
  forest(14, 40);
}
