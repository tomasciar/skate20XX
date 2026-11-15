import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export type RagdollPart = {
  id: string; center: THREE.Vector3; rotation: THREE.Quaternion; objects: THREE.Object3D[];
  mass: number; shape: { kind: 'capsule'; length: number; radius: number } | { kind: 'box'; half: THREE.Vector3 } | { kind: 'ball'; radius: number };
};
export type RagdollJoint = {
  a: string; b: string; anchor: THREE.Vector3; kind: 'ball' | 'hinge' | 'fixed'; axis?: THREE.Vector3; flex?: number;
};
export type RagdollRig = { parts: RagdollPart[]; joints: RagdollJoint[] };
type Part = { body: RAPIER.RigidBody; group: THREE.Group; previous: THREE.Vector3; current: THREE.Vector3; previousQ: THREE.Quaternion; currentQ: THREE.Quaternion };
const quaternion = (q: RAPIER.Rotation) => new THREE.Quaternion(q.x, q.y, q.z, q.w);

/** Created only during a crash; all bodies and joints are removed on recovery. */
export function createRagdoll(scene: THREE.Scene, world: RAPIER.World) {
  const root = new THREE.Group(); root.name = 'crash-ragdoll';
  const parts = new Map<string, Part>(), joints: RAPIER.ImpulseJoint[] = [];
  let previousCcdSubsteps: number | null = null;
  const focus = new THREE.Vector3(), velocity = new THREE.Vector3();
  function clear() {
    for (const joint of joints) if (joint.isValid()) world.removeImpulseJoint(joint, true);
    joints.length = 0;
    for (const part of parts.values()) world.removeRigidBody(part.body);
    parts.clear(); root.clear(); scene.remove(root);
    if (previousCcdSubsteps !== null) { world.maxCcdSubsteps = previousCcdSubsteps; previousCcdSubsteps = null; }
    // Clones share the skater's geometry and materials, so never dispose those assets here.
  }
  function start(rig: RagdollRig, momentum: THREE.Vector3, normal: THREE.Vector3) {
    clear(); previousCcdSubsteps = world.maxCcdSubsteps; world.maxCcdSubsteps = Math.max(8, world.maxCcdSubsteps); scene.add(root);
    for (const spec of rig.parts) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(spec.center.x, spec.center.y, spec.center.z)
        .setRotation(spec.rotation).setCcdEnabled(true).setLinearDamping(0.12).setAngularDamping(1.5).setAdditionalSolverIterations(24));
      body.userData = spec.id;
      const shape = spec.shape;
      const desc = shape.kind === 'capsule' ? RAPIER.ColliderDesc.capsule(Math.max(0.01, shape.length / 2 - shape.radius), shape.radius)
        : shape.kind === 'box' ? RAPIER.ColliderDesc.cuboid(shape.half.x, shape.half.y, shape.half.z) : RAPIER.ColliderDesc.ball(shape.radius);
      // Ragdoll parts hit the world; self contacts are excluded for stable folded crash poses.
      world.createCollider(desc.setMass(spec.mass).setFriction(0.7).setRestitution(0.03).setCollisionGroups(0x00020001), body);
      const carried = momentum.clone().addScaledVector(normal, momentum.dot(normal) > -5 ? 0.6 : 0);
      body.setLinvel(carried, true);
      body.setAngvel({ x: 0.8, y: 0.2, z: spec.id === 'pelvis' ? 1.3 : 0.8 }, true);
      const group = new THREE.Group(); root.add(group);
      const inverse = new THREE.Matrix4().compose(spec.center, spec.rotation, new THREE.Vector3(1,1,1)).invert();
      for (const original of spec.objects) {
        const clone = original.clone(true);
        const local = new THREE.Matrix4().multiplyMatrices(inverse, original.matrixWorld);
        local.decompose(clone.position, clone.quaternion, clone.scale); clone.visible = true; group.add(clone);
      }
      group.position.copy(spec.center); group.quaternion.copy(spec.rotation);
      parts.set(spec.id, { body, group, previous: spec.center.clone(), current: spec.center.clone(), previousQ: spec.rotation.clone(), currentQ: spec.rotation.clone() });
    }
    for (const spec of rig.joints) {
      const a = parts.get(spec.a)!, b = parts.get(spec.b)!;
      const qa = a.currentQ, qb = b.currentQ;
      const anchorA = spec.anchor.clone().sub(a.current).applyQuaternion(qa.clone().invert());
      const anchorB = spec.anchor.clone().sub(b.current).applyQuaternion(qb.clone().invert());
      const desc = spec.kind === 'fixed' ? RAPIER.JointData.fixed(anchorA, qa.clone().invert(), anchorB, qb.clone().invert())
        : spec.kind === 'hinge' ? RAPIER.JointData.revoluteWithAxes(anchorA, anchorB,
          spec.axis!.clone().applyQuaternion(qa.clone().invert()), spec.axis!.clone().applyQuaternion(qb.clone().invert()))
        : RAPIER.JointData.spherical(anchorA, anchorB);
      const joint = world.createImpulseJoint(desc, a.body, b.body, true); joint.setContactsEnabled(false);
      if (joint instanceof RAPIER.RevoluteImpulseJoint || joint instanceof RAPIER.SphericalImpulseJoint) {
        // Give the captured pose a zero reference, avoiding a snap into a different joint frame.
        const frame = qa.clone().multiply(quaternion(joint.frameX1()));
        joint.setFrameX2(qb.clone().invert().multiply(frame));
      }
      if (joint instanceof RAPIER.RevoluteImpulseJoint) {
        const flex = spec.flex ?? 1;
        joint.setLimits(-flex + 0.02, Math.max(0.1, 2.8 - flex));
        joint.configureMotorVelocity(0, 0.4);
      }
      if (joint instanceof RAPIER.SphericalImpulseJoint) {
        for (const axis of [RAPIER.JointAxis.AngX, RAPIER.JointAxis.AngY, RAPIER.JointAxis.AngZ]) {
          joint.configureMotorPosition(axis, 0, spec.b === 'head' ? 7 : 3, 1.5);
          joint.setMotorMaxForce(axis, spec.b === 'head' ? 4 : 8);
        }
      }
      joints.push(joint);
    }
    sync();
  }
  function beginStep() { for (const part of parts.values()) { part.previous.copy(part.current); part.previousQ.copy(part.currentQ); } }
  function sync() {
    for (const part of parts.values()) {
      const t = part.body.translation(), q = part.body.rotation();
      part.current.set(t.x, t.y, t.z); part.currentQ.set(q.x, q.y, q.z, q.w);
    }
    const pelvis = parts.get('pelvis');
    if (pelvis) { focus.copy(pelvis.current); const v = pelvis.body.linvel(); velocity.set(v.x, v.y, v.z); }
  }
  function shift(delta: THREE.Vector3) {
    for (const part of parts.values()) {
      part.current.add(delta); part.previous.add(delta); part.body.setTranslation(part.current, true);
    }
    focus.add(delta);
  }
  function render(alpha: number) {
    for (const part of parts.values()) {
      part.group.position.lerpVectors(part.previous, part.current, alpha);
      part.group.quaternion.slerpQuaternions(part.previousQ, part.currentQ, alpha);
    }
  }
  return { start, clear, beginStep, sync, shift, render, focus, velocity, root,
    get active() { return parts.size > 0; }, get bodyCount() { return parts.size; } };
}
