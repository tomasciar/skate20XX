import type {District} from './catalog.ts';
import type {LayoutContext} from './layout.ts';
import {populateVillage} from './village.ts';
import {populateGrove} from './grove.ts';
import {populateRidge} from './ridge.ts';
import {populateFarm} from './farm.ts';
import {populateMill} from './mill.ts';
import {populateCity} from './city.ts';

/** Every registered environment uses the same seasonal appearance and physical-world pipeline. */
export const ENVIRONMENT_LAYOUTS:Record<District,(context:LayoutContext)=>void> = {
  grove:populateGrove,
  village:populateVillage,
  ridge:populateRidge,
  farm:populateFarm,
  mill:populateMill,
  city:populateCity,
};
