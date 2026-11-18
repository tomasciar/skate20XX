/** Aggregate prop API for tools and callers that need several families. Runtime layouts import families directly. */
import type {District} from '../environments/catalog.ts';
import {makeHouse} from './buildings.ts';
import {makeCar} from './vehicles.ts';
import {makeRocks} from './nature.ts';
import {makeBench,makePlanter} from './furniture.ts';

export {treeStyleFor, makeTree, makeBush, makeRocks, makeStump, makeHedge, makeCairn} from './nature.ts';
export {makeHouse, makeShop, makeChapel, makeShed, makeCabin, makeShelter, makeHut, makeBarn, makeSawmill, makeWarehouse} from './buildings.ts';
export {makeCar, makeTractor, makeLogTruck} from './vehicles.ts';
export {makeCone, makeBench, makePlanter, makeBusStop, makeWell, makePaving, makeSign, makeFence, makeYardFence, makePicnic, makeLamp} from './furniture.ts';
export {makeLogPile, makeLookout, makeMast, makeTurbine, makeSilo, makeHayBale, makeWindpump, makeLumberStack, makeTank, makeStack, makePowerPole} from './landmarks.ts';
export {foundationMaterial} from './parts.ts';
export type {TreeStyle} from '../environments/catalog.ts';

/** Legacy mixed roadside prop for callers with only a district and variant number. */
export function makeScenery(district: District, variant: number, rng: () => number) {
  if (district === 'village' && variant % 3 === 0) return makeHouse(rng);
  if (district === 'village' && variant % 3 === 1) return makeCar(rng);
  if (district === 'ridge' || variant % 4 === 0) return makeRocks(rng);
  return variant % 3 === 1 ? makeBench() : makePlanter(rng);
}
