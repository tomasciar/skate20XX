import {BOARD,RIDER} from './player/dimensions.ts';

/** Default boy, standing anatomically upright, sole to crown; excludes helmet/hair and riding crouch. */
export const REFERENCE_RIDER_HEIGHT_UNITS=RIDER.hipHeight+.53+.116-BOARD.gripY;
export const REFERENCE_RIDER_HEIGHT_METRES=1.75;
export const METRES_PER_UNIT=REFERENCE_RIDER_HEIGHT_METRES/REFERENCE_RIDER_HEIGHT_UNITS;
export const MPH_PER_MPS=3600/1609.344;
export const metres=(worldUnits:number)=>worldUnits*METRES_PER_UNIT;
export const worldUnits=(metres:number)=>metres/METRES_PER_UNIT;
export const mph=(worldUnitsPerSecond:number)=>metres(worldUnitsPerSecond)*MPH_PER_MPS;
export const speedFromMph=(mph:number)=>worldUnits(mph/MPH_PER_MPS);
