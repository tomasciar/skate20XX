/** Deterministic roof variations; the other two roofs in each cycle keep their flat exits. */
export function hasRoofLaunch(owner:number,firstOwner:number,period:number) {
  const cycle=(owner-firstOwner)/period;
  return Number.isInteger(cycle) && cycle>=0 && cycle%3===0;
}
export const ROOF_LAUNCH={width:5,length:14,height:1.8,offset:5,landing:160} as const;
