import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { solveLimb, solveArm, createRiderMotion } from '../src/player/pose.ts';
import { createSkaterVisual } from '../src/player/skaterVisual.ts';
import { BOARD, FOOT_Y, RIDER } from '../src/player/dimensions.ts';

const base = { dt: 1 / 120, speed: 25, push: 0, verticalSpeed: 0, grinding: false,
  crouch: 0, lean: 0, airborne: false, bail: false, wheelRoll: 0, boardSpin: { x: 0, y: 0, z: 0 } };

test('knees bend forward and elbows back with constant bone lengths and no overextension', () => {
  for (const side of [-1, 1]) for (const drop of [0, 0.1, 0.22]) {
    const hip = new THREE.Vector3(side * 0.095, 0.73 - drop, 0.03 + drop * 0.4);
    const ankle = new THREE.Vector3(side * 0.255, FOOT_Y + 0.06, 0);
    const leg = solveLimb(hip, ankle, new THREE.Vector3(0, 0, -1), 0.38, 0.38);
    assert.ok(Math.abs(hip.distanceTo(leg.joint) - 0.38) < 1e-8);
    assert.ok(Math.abs(leg.joint.distanceTo(leg.end) - 0.38) < 1e-8);
    assert.ok(leg.joint.z < hip.clone().lerp(ankle, 0.5).z);
    assert.ok(leg.end.distanceTo(ankle) < 1e-8);
    const shoulder = new THREE.Vector3(side * 0.17, 0.36, 0);
    const wrist = new THREE.Vector3(side * 0.28, 0.1, -0.2);
    const arm = solveArm(shoulder, wrist, side);
    assert.ok(Math.abs(shoulder.distanceTo(arm.joint) - 0.25) < 1e-8);
    assert.ok(Math.abs(arm.joint.distanceTo(arm.end) - 0.24) < 1e-8);
    assert.ok(arm.joint.z > shoulder.clone().lerp(wrist, 0.5).z);
    assert.ok(arm.end.z < arm.joint.z, "forearm must fold forward from the elbow");
  }
  const stretched = solveLimb(new THREE.Vector3(), new THREE.Vector3(0, -5, 0), new THREE.Vector3(0, 0, -1), 0.38, 0.38);
  assert.ok(stretched.end.length() < 0.76);
});

test('crouching and leaning keep both soles on the grip without rolling the wheels', () => {
  const visual = createSkaterVisual();
  for (const crouch of [0, 0.5, 1]) for (const lean of [-1, 0, 1]) {
    for (let i = 0; i < 120; i++) visual.setPose({ ...base, crouch, lean });
    visual.root.updateMatrixWorld(true);
    for (const side of [-1, 1]) {
      const foot = visual.root.getObjectByName(`foot-${side}`)!;
      const sole = foot.localToWorld(new THREE.Vector3(0, BOARD.soleBottom, 0));
      assert.ok(Math.abs(sole.y - BOARD.gripY) < 1e-8, `sole lifted: ${sole.y}`);
    }
    assert.equal(visual.board.rotation.z, 0);
    for (const wheel of visual.wheels) assert.equal(wheel.position.y, BOARD.wheelY);
  }
});

test('pose transitions soften crouching and absorb landings before recovering', () => {
  const motion = createRiderMotion();
  motion.update(1 / 120, 1, 1, false, 0, 0);
  assert.ok(motion.state.crouch > 0 && motion.state.crouch < 0.2);
  motion.update(1 / 120, 0, 0, true, 0, -8);
  motion.update(1 / 120, 0, 0, false, 0, 0);
  const impact = motion.state.landing; assert.ok(impact > 0.05);
  for (let i = 0; i < 120; i++) motion.update(1 / 120, 0, 0, false, 0, 0);
  assert.ok(motion.state.landing < 0.001);
  motion.reset(); assert.equal(motion.state.landing, 0);
});

test('animated pushing and weight shifts keep shins connected to the ankles', () => {
  const visual = createSkaterVisual();
  for (let i = 0; i < 1440; i++) {
    visual.setPose({ ...base, speed: 8, push: 1, lean: Math.sin(i * 0.02), wheelRoll: i * 2 });
    visual.root.updateMatrixWorld(true);
    for (const side of [-1, 1]) {
      const foot = visual.root.getObjectByName(`foot-${side}`)!;
      const shin = visual.root.getObjectByName(`shin-${side}`)!;
      const ankle = foot.localToWorld(new THREE.Vector3(0, 0.06, 0));
      const shinEnd = shin.localToWorld(new THREE.Vector3(0, 0.5, 0));
      assert.ok(ankle.distanceTo(shinEnd) < 1e-6, `shin disconnected by ${ankle.distanceTo(shinEnd)}`);
    }
  }
});

test('both animated elbows stay behind the wrist path and connected through every stance', () => {
  const visual = createSkaterVisual();
  for (const pose of [base, { ...base, crouch: 1 }, { ...base, speed: 8, push: 1 },
    { ...base, airborne: true }, { ...base, grinding: true }, { ...base, lean: -1 }, { ...base, lean: 1 }]) {
    for (let i = 0; i < 240; i++) {
      visual.setPose(pose);
      for (const side of [-1, 1]) {
        const upper = visual.root.getObjectByName(`upper-arm-${side}`)!;
        const fore = visual.root.getObjectByName(`forearm-${side}`)!;
        const elbow = visual.root.getObjectByName(`elbow-${side}`)!;
        const hand = visual.root.getObjectByName(`hand-${side}`)!;
        const endpoint = (mesh: THREE.Object3D, y: number) =>
          new THREE.Vector3(0, y, 0).multiply(mesh.scale).applyQuaternion(mesh.quaternion).add(mesh.position);
        const shoulder = endpoint(upper, -0.5);
        const wrist = hand.position;
        const axis = wrist.clone().sub(shoulder).normalize();
        const elbowOffset = elbow.position.clone().sub(shoulder);
        elbowOffset.addScaledVector(axis, -elbowOffset.dot(axis));
        assert.ok(elbowOffset.z > 0, `elbow ${side} bent forward`);
        assert.ok(wrist.z < elbow.position.z, `forearm ${side} folded backward`);
        assert.ok(endpoint(upper, 0.5).distanceTo(elbow.position) < 1e-8);
        assert.ok(endpoint(fore, -0.5).distanceTo(elbow.position) < 1e-8);
        assert.ok(endpoint(fore, 0.5).distanceTo(wrist) < 1e-8);
      }
    }
  }
});


test('shorter leg proportions keep each visible bone at the configured length', () => {
  assert.ok(RIDER.upperLeg + RIDER.lowerLeg < 0.7);
  const visual = createSkaterVisual();
  for (let i = 0; i < 120; i++) visual.setPose(base);
  for (const side of [-1, 1]) {
    const shin = visual.root.getObjectByName(`shin-${side}`)!;
    assert.ok(Math.abs(shin.scale.y - RIDER.lowerLeg) < 1e-8);
  }
  let meshCount = 0; visual.root.traverse(obj => { if (obj instanceof THREE.Mesh) meshCount++; });
  assert.ok(meshCount < 55, `too many individual rider meshes: ${meshCount}`);
});
