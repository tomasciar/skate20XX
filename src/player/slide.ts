export const SLIDE = {
  response: 12,
  deceleration: 18,
  /** Time after releasing S to choose the stance with A/D. */
  exitWindow: 0.3,
  minSpeed: 0.4,
} as const;

export type SlideState = { active: boolean; amount: number; side: number; choosing: boolean };
const wrap=(angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));

/** Let the wheels skid across their heading, then turn out regular (D) or switch (A). */
export function createSlide() {
  const state:SlideState={active:false,amount:0,side:1,choosing:false};
  let phase:'idle'|'held'|'choosing'|'recovering'='idle';
  let exitFacing=1,window=0,travelYaw=0;

  function reset() {
    phase='idle';exitFacing=1;window=travelYaw=0;
    state.active=state.choosing=false;state.amount=0;state.side=1;
  }

  function update(dt:number,held:boolean,steer:number,yaw:number,motionYaw:number,speed:number,supported:boolean) {
    if (!supported) { reset();return yaw; }
    if (speed>SLIDE.minSpeed) travelYaw=motionYaw;
    if (held && phase!=='held' && (state.active || speed>SLIDE.minSpeed)) {
      if (!state.active) {
        exitFacing=Math.cos(yaw-travelYaw)>=0 ? 1 : -1;
        state.side=steer ? -Math.sign(steer) : 1;
      }
      phase='held';
    }
    if (!held && phase==='held') { phase='choosing';window=SLIDE.exitWindow; }
    if (phase==='choosing') {
      window=Math.max(0,window-dt);
      if (steer) { exitFacing=steer>0 ? 1 : -1;phase='recovering'; }
      else if (!window) phase='recovering';
    }
    state.active=phase!=='idle';state.choosing=phase==='choosing';
    if (!state.active) return yaw;
    const target=travelYaw+(phase==='recovering' ? (exitFacing<0 ? Math.PI : 0) : state.side*Math.PI/2);
    const difference=wrap(target-yaw);
    const next=wrap(yaw+difference*(1-Math.exp(-SLIDE.response*dt)));
    state.amount=Math.sin(next-travelYaw)**2;
    if (phase==='recovering' && Math.abs(wrap(target-next))<0.02) {
      phase='idle';state.active=false;state.amount=0;
      return wrap(target);
    }
    return next;
  }

  return {state,update,reset};
}
