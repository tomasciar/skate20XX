import type {District} from './catalog.ts';
import type {LayoutContext} from './layout.ts';
import {populateVillage} from './village.ts';
import {populateGrove} from './grove.ts';
import {populateRidge} from './ridge.ts';
import {populateFarm} from './farm.ts';
import {populateMill} from './mill.ts';
import {populateCity} from './city.ts';
import {populateHarbor} from './harbor.ts';
import {populateCanyon} from './canyon.ts';
import {populateGardens} from './gardens.ts';
import {populateAlpine} from './alpine.ts';

/** Every registered environment uses the same seasonal appearance and physical-world pipeline. */
export const ENVIRONMENT_LAYOUTS:Record<District,(context:LayoutContext)=>void> = {
  grove:populateGrove,
  village:populateVillage,
  ridge:populateRidge,
  farm:populateFarm,
  mill:populateMill,
  city:populateCity,
  harbor:populateHarbor,
  canyon:populateCanyon,
  gardens:populateGardens,
  alpine:populateAlpine,
};
