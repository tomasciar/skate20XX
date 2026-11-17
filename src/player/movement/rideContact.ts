import {LANDING_SPEED} from './speed.ts';

export const RIDE_CONTACT={gap:.1,grace:.08,normalSpeed:2.5,minAirTime:.08} as const;

/** Contact for controls/animation; suspension forces still require actual wheel contact. */
export function createRideContact() {
  let airborne=false,missing=0,airTime=0,landings=0,impact=0,clearFlight=false;
  function reset(){airborne=false;missing=airTime=landings=impact=0;clearFlight=false;}
  function takeoff(){if(!airborne){airborne=true;airTime=0;}missing=0;}
  function update(dt:number,grounded:boolean,nearRoad:boolean,normalImpact:number,clearDeparture=false) {
    let landed=false;
    if(grounded) {
      landed=airborne && (clearFlight || airTime>=RIDE_CONTACT.minAirTime) && normalImpact>=LANDING_SPEED;
      if(landed){landings++;impact=normalImpact;}
      airborne=false;missing=airTime=0;clearFlight=false;
    } else {
      missing=nearRoad?0:missing+dt;
      if(clearDeparture){airborne=true;clearFlight=true;}
      if(missing>=RIDE_CONTACT.grace)airborne=true;
      if(airborne)airTime+=dt;
    }
    return landed;
  }
  return {reset,takeoff,update,get airborne(){return airborne;},get landings(){return landings;},get impact(){return impact;}};
}
