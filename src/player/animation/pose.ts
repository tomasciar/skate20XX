import * as THREE from 'three';
import { createPumpCycle } from '../movement/pump.ts';
import type { PumpState } from '../movement/pump.ts';

/** A pole selects which side of the shoulder/wrist or hip/ankle line the joint occupies. */
export function solveLimb(start: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, upper: number, lower: number) {
  const axis = target.clone().sub(start);
  const distance = THREE.MathUtils.clamp(axis.length(), Math.abs(upper - lower) + 0.0001, upper + lower - 0.0001);
  axis.normalize();
  const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize();
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  return {
    joint: start.clone().addScaledVector(axis, along).addScaledVector(bend, height),
    end: start.clone().addScaledVector(axis, distance),
  };
}

/** The elbow points back (+Z); the forearm folds toward the front (-Z).
 * Knees use the opposite pole. Mirror the small outward component for each arm.
 */
export function solveArm(shoulder: THREE.Vector3, wrist: THREE.Vector3, side: number, scale=1) {
  return solveLimb(shoulder, wrist, new THREE.Vector3(side * 0.25, -0.1, 1), 0.25*scale, 0.24*scale);
}

export function createRiderMotion() {
  const pump = createPumpCycle();
  const state = { sway: 0, kneeLoad: 0, pushPhase: 0, time: 0, crouch: 0, lean: 0, air: 0, push: 0, brake: 0, landing: 0, impact: 0 };
  let wasAirborne = false, fallSpeed = 0;
  function reset() {
    pump.reset();
    Object.assign(state, { sway: 0, kneeLoad: 0, pushPhase: 0, time: 0, crouch: 0, lean: 0, air: 0, push: 0, brake: 0, landing: 0, impact: 0 });
    wasAirborne = false; fallSpeed = 0;
  }
  function update(dt: number, crouch: number, lean: number, airborne: boolean, push: number, verticalSpeed: number, speed = 0, externalPump?: PumpState, grinding = false) {
    state.time += dt;
    if (wasAirborne && !airborne) {
      state.landing = Math.min(0.11, Math.max(0, -fallSpeed) * 0.009);
      state.impact = state.landing;
    }
    if (airborne) fallSpeed = verticalSpeed;
    wasAirborne = airborne;
    state.crouch = THREE.MathUtils.damp(state.crouch, crouch, 12, dt);
    state.lean = THREE.MathUtils.damp(state.lean, lean, 7, dt);
    state.air = THREE.MathUtils.damp(state.air, airborne ? 1 : 0, 10, dt);
    state.brake = THREE.MathUtils.damp(state.brake, push < 0 && !airborne ? 1 : 0, 7, dt);
    const stroke = externalPump ?? pump.update(dt, push > 0, speed, !airborne && !grinding && crouch < 0.1);
    state.push = stroke.weight;
    state.pushPhase = stroke.phase;
    const fast = THREE.MathUtils.smoothstep(speed, 5, 60);
    const grounded = 1 - state.air;
    // Small, slow weight adjustments under the balance reactions, rather than a rhythmic wobble.
    const swayTarget = (Math.sin(state.time * .72) + .28 * Math.sin(state.time * 1.17 + .6)) * .0023 * fast * grounded;
    state.sway = THREE.MathUtils.damp(state.sway, swayTarget, 6, dt);
    // A lower stance at speed, more flex under carving/braking loads, then recover smoothly.
    const kneeTarget = grounded * (fast * 0.14 + Math.abs(state.lean) * 0.10 + state.brake * 0.08 + (grinding ? 0.12 : 0))
      + Math.sin(state.time * .72 + .7) * .0025 * fast * grounded;
    state.kneeLoad = THREE.MathUtils.damp(state.kneeLoad, kneeTarget, 5, dt);
    state.landing = THREE.MathUtils.damp(state.landing, 0, 10, dt);
    return state;
  }
  return { state, update, reset };
}
