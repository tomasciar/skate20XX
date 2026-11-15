import * as THREE from 'three';
import { GRIND_HEIGHT } from './dimensions.ts';
import { MAX_SPEED } from './speed.ts';

export type GrindRail = { id: string; start: THREE.Vector3; end: THREE.Vector3 };
export type GrindState = { active: boolean; balance: number; meters: number; message: string | null };
const TRUCK_HEIGHT = GRIND_HEIGHT;

/** Rail constraints retain longitudinal momentum and let gravity accelerate the slide. */
export function createGrindSystem() {
  const state: GrindState = { active: false, balance: 0, meters: 0, message: null };
  let railId: string | null = null, cooldown = 0, direction = 1;
  const tangent = new THREE.Vector3(), offset = new THREE.Vector3();
  function reset() {
    state.active = false; state.balance = state.meters = 0; state.message = null;
    railId = null; cooldown = 0;
  }
  function release(message: string) {
    state.active = false; state.message = message; railId = null; cooldown = 0.35;
  }
  function update(dt: number, position: THREE.Vector3, velocity: THREE.Vector3,
    forward: THREE.Vector3, normal: THREE.Vector3, rails: readonly GrindRail[],
    steer: number, ollie: boolean, braking: boolean, canCatch: boolean) {
    cooldown = Math.max(0, cooldown - dt);
    if (!state.active && cooldown === 0 && canCatch && velocity.length() > 2 && velocity.dot(normal) <= 1) {
      for (const rail of rails) {
        tangent.copy(rail.end).sub(rail.start).normalize();
        offset.copy(position).sub(rail.start);
        const along = offset.dot(tangent), height = offset.dot(normal) - TRUCK_HEIGHT;
        const sideways = offset.clone().addScaledVector(tangent, -along).addScaledVector(normal, -offset.dot(normal)).length();
        // Require a landing on top, near the centerline, with trucks aligned in either direction.
        if (along < 0 || along > rail.start.distanceTo(rail.end) || sideways > 0.3 ||
          height < -0.08 || height > 0.22 || Math.abs(forward.dot(tangent)) < 0.8) continue;
        railId = rail.id; direction = velocity.dot(tangent) >= 0 ? 1 : -1;
        state.active = true; state.balance = 0; state.meters = 0; state.message = '50–50 GRIND';
        break;
      }
    }
    if (!state.active) return false;
    const rail = rails.find(r => r.id === railId);
    if (!rail) { release('Grind complete'); return false; }
    tangent.copy(rail.end).sub(rail.start).normalize();
    const length = rail.start.distanceTo(rail.end);
    const along = position.clone().sub(rail.start).dot(tangent);
    if (along < 0 || along > length) { release('Grind complete'); return false; }
    state.balance = THREE.MathUtils.clamp(state.balance + steer * dt * 1.8, -1.1, 1.1);
    if (Math.abs(state.balance) > 1) {
      release('Slipped off'); velocity.addScaledVector(new THREE.Vector3().crossVectors(tangent, normal), steer * 2);
      return false;
    }
    const signedSpeed = velocity.dot(tangent);
    const gravity = -18 * tangent.y;
    const friction = (braking ? 24 : 0.45) * direction;
    const speed = Math.max(0, Math.min(MAX_SPEED, (signedSpeed + (gravity - friction) * dt) * direction));
    velocity.copy(tangent).multiplyScalar(speed * direction);
    position.copy(rail.start).addScaledVector(tangent, along).addScaledVector(normal, TRUCK_HEIGHT);
    state.meters += speed * dt;
    if (ollie) {
      release('Ollie out'); velocity.addScaledVector(normal, 6.5);
    } else if (speed < 0.5) {
      release('Slipped off');
    }
    // Even an ollie exit uses this frame's constrained position and exit velocity.
    return true;
  }
  return { state, update, reset };
}
