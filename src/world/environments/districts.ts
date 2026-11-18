import {makeSign} from '../props/furniture.ts';
import {ENVIRONMENT_LAYOUTS} from './registry.ts';
import {createLayoutContext} from './layout.ts';
import type {DistrictContext} from './layout.ts';
export type {Plant,DistrictContext} from './layout.ts';

/** Common placement, snow compatibility, and incremental construction for every environment. */
export function* populateDistrict(context:DistrictContext):Generator<void> {
  const layout=createLayoutContext(context);
  if(context.entering)layout.place(()=>makeSign(context.district,context.index),13.1,2.6,0,3);
  ENVIRONMENT_LAYOUTS[context.district](layout);
  yield* layout.build();
}
