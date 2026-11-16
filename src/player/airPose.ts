import {MathUtils} from 'three';

export type AirPoseInput={
  dt:number;active:boolean;verticalSpeed:number;turn:number;pitch:number;roll:number;travelSide:number;
  /** Signed local +Y angular rate, normalized to the current maximum yaw speed. */
  yaw?:number;
};

/** Core and arm balance follow the jump and actual rotation, without a repeating airborne waving cycle. */
export function createAirPose() {
  const state={weight:0,lift:0,descent:0,launch:0,turn:0,pitch:0,roll:0,travelSide:1,
    yaw:0,hipYaw:0,spinEffort:0,pitchLead:0,rollLead:0,pitchEffort:0,rollEffort:0};
  let initialized=false,wasActive=false;
  function reset() {
    Object.assign(state,{weight:0,lift:0,descent:0,launch:0,turn:0,pitch:0,roll:0,travelSide:1,
      yaw:0,hipYaw:0,spinEffort:0,pitchLead:0,rollLead:0,pitchEffort:0,rollEffort:0});
    initialized=false;wasActive=false;
  }
  function update(input:AirPoseInput) {
    const {dt,active}=input;
    if(!initialized) {
      state.weight=active?1:0;state.travelSide=input.travelSide;
      initialized=true;
    }
    if(dt<=0)return state;
    if(active&&!wasActive) {
      state.launch=MathUtils.smoothstep(input.verticalSpeed,.75,6);
      state.travelSide=input.travelSide;
    }
    state.weight=MathUtils.damp(state.weight,active?1:0,active?10:14,dt);
    state.lift=MathUtils.damp(state.lift,active?MathUtils.clamp(input.verticalSpeed/10,0,1):0,7,dt);
    state.descent=MathUtils.damp(state.descent,active?MathUtils.clamp(-input.verticalSpeed/14,0,1):0,6,dt);
    state.launch*=Math.exp(-5*dt);
    state.turn=MathUtils.damp(state.turn,active?MathUtils.clamp(input.turn,-1,1):0,6,dt);
    state.pitch=MathUtils.damp(state.pitch,active?MathUtils.clamp(input.pitch,-1,1):0,7,dt);
    state.roll=MathUtils.damp(state.roll,active?MathUtils.clamp(input.roll,-1,1):0,7,dt);
    state.yaw=MathUtils.damp(state.yaw,active?MathUtils.clamp(input.yaw ?? -input.turn,-1,1):0,18,dt);
    state.hipYaw=MathUtils.damp(state.hipYaw,state.yaw,7,dt);
    state.pitchLead=MathUtils.damp(state.pitchLead,active?MathUtils.clamp(input.pitch,-1,1):0,16,dt);
    state.rollLead=MathUtils.damp(state.rollLead,active?MathUtils.clamp(input.roll,-1,1):0,16,dt);
    // Fast shoulder motion against slower hip/arm follow-through gives a finite initiation
    // and checking gesture, rather than repeatedly winding up through every revolution.
    state.spinEffort=MathUtils.clamp((state.yaw-state.hipYaw)*2,-1,1);
    state.pitchEffort=MathUtils.clamp((state.pitchLead-state.pitch)*2,-1,1);
    state.rollEffort=MathUtils.clamp((state.rollLead-state.roll)*2,-1,1);
    wasActive=active;
    return state;
  }
  return {state,update,reset};
}
