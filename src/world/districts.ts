import * as THREE from 'three';
import type { District } from './generation.ts';
import {
  makeTree, treeStyleFor, makeBush, makeRocks, makeStump, makeHouse, makeShop, makeChapel, makeCar, makeBench, makePlanter,
  makeBusStop, makeWell, makeShed, makeHedge, makePaving, makeCabin, makeShelter, makeLogPile, makeLookout, makeMast, makeHut,
  makeCairn, makeTurbine, makeBarn, makeSilo, makeHayBale, makeWindpump, makeTractor, makeSawmill, makeWarehouse,
  makeLumberStack, makeTank, makeStack, makePowerPole, makeLogTruck, makeSign, makeFence, makeYardFence, makePicnic, makeLamp,
} from './scenery.ts';
import type { TreeStyle } from './scenery.ts';

/**
 * District layouts. The road runs along the chunk (0..70 m, downhill); `x` is the distance from its
 * centerline. The guardrail stands at 8 m and a footpath runs from 9.6 to 11.4 m on both sides, so
 * frontages start at 12 m: street furniture first, then lots whose buildings face the road.
 */
export type Plant = (object: THREE.Object3D, x: number, along: number, yaw?: number) => void;
export type DistrictContext = { district: District; index: number; entering: boolean; rng: () => number; plant: Plant };

const LENGTH = 70;
/** Yaw that turns a builder's +Z front toward the road. */
const facing = (side: number) => side > 0 ? -Math.PI/2 : Math.PI/2;
/** Yaw that lays a builder's X length along the road. */
const ALONG = Math.PI/2;

export function* populateDistrict({ district, index, entering, rng, plant }: DistrictContext): Generator<void> {
  const queue: (() => void)[] = [], taken: { x: number; along: number; radius: number }[] = [];
  const free = (x: number, along: number, radius: number) =>
    taken.every(t => Math.hypot(t.x-x, t.along-along) > t.radius+radius);
  /** Reserve ground and build later, so main features claim their space before filler is scattered. */
  function place(make: () => THREE.Object3D, x: number, along: number, yaw = 0, radius = 0) {
    if (radius) taken.push({ x, along, radius });
    queue.push(() => plant(make(), x, along, yaw));
  }
  function scatter(count: number, make: () => THREE.Object3D, near: number, far: number, radius: number, spin = true) {
    for (let i = 0; i < count; i++) {
      const side = rng() < 0.5 ? -1 : 1, x = side*(near+rng()*(far-near)), along = 2+rng()*(LENGTH-4);
      if (free(x, along, radius)) place(make, x, along, spin ? rng()*Math.PI*2 : 0, radius);
    }
  }
  const tree = (style?: TreeStyle, scale = 1) => () => {
    const made = makeTree(rng, style ?? treeStyleFor(district, rng)); made.scale.multiplyScalar(scale); return made;
  };
  const forest = (count: number, near = 26, far = 136, style?: TreeStyle) => {
    for (let i = 0; i < count; i++) {
      const side = i%2 ? -1 : 1, x = side*(near+rng()*(far-near)), along = 3+rng()*64;
      if (free(x, along, 2.5)) place(tree(style, 1.1+rng()*0.65), x, along, rng()*Math.PI*2, 1.5);
    }
  };
  const side = () => rng() < 0.5 ? -1 : 1;

  if (entering) place(() => makeSign(district, index), 13.1, 2.6, 0, 3);

  if (district === 'village') {
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
          place(() => makeHouse(rng), s*20.3, lot, facing(s), 6.2);
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
  } else if (district === 'grove') {
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
  } else if (district === 'ridge') {
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
  } else if (district === 'farm') {
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
  } else {
    const yard = index%2 ? 1 : -1, clear = -yard;
    for (const along of [10,45]) place(() => makePowerPole(), clear*12.9, along, 0, 0.8);
    for (const along of [27,62]) place(() => makeLamp(yard, rng), yard*9, along);
    for (let i = 0; i < 8; i++) if (i !== 3 && i !== 4) place(() => makeYardFence(8.75), yard*13.1, 4.4+i*8.75, ALONG);
    place(() => makePaving(9,7,undefined), yard*16, 35);
    if (rng() < 0.5) place(() => makeSawmill(rng), yard*21.5, 17, facing(yard), 8.5);
    else place(() => makeWarehouse(rng), yard*22.5, 17, facing(yard), 8.5);
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

  for (let i = 0; i < queue.length; i++) { queue[i]!(); if (i%3 === 2) yield; }
}
