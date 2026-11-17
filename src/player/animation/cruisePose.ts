import {MathUtils} from 'three';

export type CruiseInput={
  dt:number;
  active:boolean;
  speed:number;
  turn:number;
  /** Incline in the direction of travel, in radians; constant grades produce no repeated bounce. */
  surfacePitch?:number;
  travelSide:1|-1;
};

/** Grounded balance only. Feet, trick targets and the board remain owned by the contact/pose solvers. */
export function createCruisePose() {
  const state={weight:0,pace:0,travelSide:1,turn:0,chestTurn:0,armTurn:0,acceleration:0,compression:0,settle:0,chestSettle:0};
  let initialized=false,previousSpeed=0,previousPitch=0,previousSide=1,wasActive=false,coastTime=0;
  function reset() {
    Object.assign(state,{weight:0,pace:0,travelSide:1,turn:0,chestTurn:0,armTurn:0,acceleration:0,compression:0,settle:0,chestSettle:0});
    initialized=false;previousSpeed=previousPitch=coastTime=0;previousSide=1;wasActive=false;
  }
  function update(input:CruiseInput) {
    const {dt,active,travelSide}=input,speed=Math.max(0,input.speed),pitch=input.surfacePitch ?? 0;
    if(!initialized) {
      // The paused/start pose should already be the resting stance, without a startup lean impulse.
      state.weight=active?1:0;state.pace=MathUtils.smoothstep(speed,3,40);state.travelSide=travelSide;
      previousSpeed=speed;previousPitch=pitch;previousSide=travelSide;wasActive=active;initialized=true;
    }
    if(dt<=0)return state;
    const continuous=active&&wasActive&&previousSide===travelSide&&dt<=.1;
    const acceleration=continuous?MathUtils.clamp((speed-previousSpeed)/(dt*12),-1,1):0;
    const pitchRate=continuous?MathUtils.clamp((pitch-previousPitch)/dt,-2,2):0;
    const compression=active&&speed>1?MathUtils.clamp(pitchRate*.11,-.055,.18):0;
    // Shift weight, hold it, then settle onto the other foot. Different follow-through
    // in the chest and wrists keeps long coasts alive without bouncing the whole rider.
    if(active)coastTime+=dt;
    const phase=(coastTime%9)/9;
    const settle=active?(MathUtils.smoothstep(phase,.12,.30)-1.6*MathUtils.smoothstep(phase,.52,.72)
      +.6*MathUtils.smoothstep(phase,.86,1))*(.3+.7*state.pace):0;
    state.weight=MathUtils.damp(state.weight,active?1:0,active?7:12,dt);
    state.pace=MathUtils.damp(state.pace,MathUtils.smoothstep(speed,3,40),4,dt);
    state.travelSide=MathUtils.damp(state.travelSide,travelSide,7,dt);
    state.turn=MathUtils.damp(state.turn,active?MathUtils.clamp(input.turn,-1,1):0,10,dt);
    state.chestTurn=MathUtils.damp(state.chestTurn,state.turn,6,dt);
    state.armTurn=MathUtils.damp(state.armTurn,state.chestTurn,4,dt);
    state.acceleration=MathUtils.damp(state.acceleration,acceleration,6,dt);
    state.compression=MathUtils.damp(state.compression,compression,compression>state.compression?14:6,dt);
    state.settle=MathUtils.damp(state.settle,settle,2.8,dt);
    state.chestSettle=MathUtils.damp(state.chestSettle,state.settle,2,dt);
    previousSpeed=speed;previousPitch=pitch;previousSide=travelSide;wasActive=active;
    return state;
  }
  return {state,update,reset};
}
