import * as THREE from 'three';

/** `pitch` and `roll` accumulate signed radians about the rider's local axes; positive pitch is a backflip. */
export type AirRotationState = { active: boolean; engaged: boolean; pitch: number; roll: number };
export const AIR_ROTATION_SPEED = Math.PI*2/0.95;

/** Local quaternion rotations allow complete and combined flips without Euler limits. */
export function createAirRotation() {
  const state: AirRotationState = {active:false,engaged:false,pitch:0,roll:0};
  const rotation=new THREE.Quaternion(), velocity=new THREE.Vector3();
  const target=new THREE.Vector3(), axis=new THREE.Vector3(), step=new THREE.Quaternion();
  const UP=new THREE.Vector3(0,1,0), counted=new THREE.Vector3();
  function reset() { state.active=state.engaged=false;state.pitch=state.roll=0;rotation.identity();velocity.set(0,0,0); }
  /**
   * `heading` is the board's yaw away from straight down the course. Inputs are read in the course's frame
   * (the camera's), so W always tumbles forward down the hill, whichever way the board happens to point.
   */
  function update(dt: number, toggle: boolean, pitch: number, roll: number, airborne: boolean, heading = 0) {
    if(!airborne) { reset();return; }
    if(toggle) { state.active=!state.active;state.engaged=true; }
    // Switching back to steering preserves the aerial pose without continuing to tumble.
    if(!state.active) { velocity.set(0,0,0);return; }
    target.set(-pitch,0,-roll).applyAxisAngle(UP,-heading);
    if(target.lengthSq()>1)target.normalize();
    target.multiplyScalar(AIR_ROTATION_SPEED);
    velocity.lerp(target,1-Math.exp(-14*dt));
    const speed=velocity.length();
    if(speed>0.00001) {
      axis.copy(velocity).multiplyScalar(1/speed);
      step.setFromAxisAngle(axis,speed*dt);
      rotation.multiply(step).normalize();
      // Count turns in the course frame too, so a flip is named for how it looked.
      counted.copy(velocity).applyAxisAngle(UP,heading);
      state.pitch+=counted.x*dt;state.roll+=counted.z*dt;
    }
  }
  return {state,rotation,update,reset};
}

const COUNTS=['','Double ','Triple '];
/** Name the whole-body rotation that was just landed, or null if no full turn was completed. */
export function describeAirRotation(state: Pick<AirRotationState,'pitch'|'roll'>): string | null {
  const flips=Math.round(Math.abs(state.pitch)/(Math.PI*2)), rolls=Math.round(Math.abs(state.roll)/(Math.PI*2));
  if(!flips && !rolls) return null;
  const count=Math.max(flips,rolls), prefix=COUNTS[count-1] ?? `${count}x `;
  if(flips && rolls) return `${prefix}Corkscrew`;
  return prefix+(flips ? (state.pitch>0 ? 'Backflip' : 'Frontflip') : 'Barrel Roll');
}
