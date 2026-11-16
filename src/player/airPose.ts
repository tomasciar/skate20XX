import {MathUtils} from 'three';

export type AirPoseInput={
  dt:number;active:boolean;verticalSpeed:number;turn:number;pitch:number;roll:number;travelSide:number;
};

/** Arm balance follows the jump and rotation inputs, without a repeating airborne waving cycle. */
export function createAirPose() {
  const state={weight:0,lift:0,descent:0,launch:0,turn:0,pitch:0,roll:0,travelSide:1};
  let initialized=false,wasActive=false;
  function reset() {
    Object.assign(state,{weight:0,lift:0,descent:0,launch:0,turn:0,pitch:0,roll:0,travelSide:1});
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
    wasActive=active;
    return state;
  }
  return {state,update,reset};
}
