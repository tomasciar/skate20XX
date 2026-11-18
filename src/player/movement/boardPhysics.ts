import RAPIER from '@dimforge/rapier3d-compat';
import type {Vector3} from 'three';

/** Person-sized inertia so flips take a real moment, not a frisbee twitch. */
const BOARD_INERTIA={x:14,y:9,z:6};
export const BOARD_MASS=72;

export function createBoardBody(world:RAPIER.World,spawn:Vector3) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.x, spawn.y, spawn.z)
      .setCanSleep(false)
      .setCcdEnabled(true)
      .setLinearDamping(0)
      .setAngularDamping(0.35)
  );
  const boardCollider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.11, 0.04, 0.38)
      .setFriction(0.05)
      .setRestitution(0.02)
      .setMassProperties(BOARD_MASS, { x: 0, y: 0, z: 0 }, BOARD_INERTIA, { x: 0, y: 0, z: 0, w: 1 }),
    body
  );

  return {body,collider:boardCollider};
}
export function restoreBoardCollider(collider:RAPIER.Collider) {
  collider.setMassProperties(BOARD_MASS,{x:0,y:0,z:0},BOARD_INERTIA,{x:0,y:0,z:0,w:1});
  collider.setFriction(0.05);collider.setCollisionGroups(0xffffffff);
}
export function releaseBoardCollider(collider:RAPIER.Collider) {
  collider.setMassProperties(3,{x:0,y:0,z:0},{x:0.18,y:0.18,z:0.06},{x:0,y:0,z:0,w:1});
  collider.setFriction(0.55);collider.setCollisionGroups(0x00040001);
}
