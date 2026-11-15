import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { planChunk, CHUNK_LENGTH } from '../src/world/generation.ts';
import { createRamp, RAMP } from '../src/world/ramp.ts';
import { createBoardPlayer } from '../src/player/board.ts';
import { createTrickSystem } from '../src/player/tricks.ts';
import { createInput } from '../src/input.ts';
import { BOARD } from '../src/player/dimensions.ts';
import { createController } from '../src/player/controller.ts';

test('10,000 seeded chunks remain reproducible, spaced, and passable', () => {
  const kinds = new Set(), districts = new Set();
  assert.equal(planChunk(0).encounters.length, 0);
  for (let i = 0; i < 10000; i++) {
    const plan = planChunk(i); assert.deepEqual(plan, planChunk(i)); districts.add(plan.district);
    let previousEnd = 0;
    for (const e of plan.encounters) {
      kinds.add(e.kind);
      assert.ok(Math.abs(e.x) - e.width / 2 > 2.2);
      assert.ok(Math.abs(e.x) + e.width / 2 < 7.5);
      assert.ok(e.along - e.length / 2 > previousEnd + 8);
      previousEnd = e.along + e.length / 2;
      assert.ok(previousEnd < CHUNK_LENGTH - 8);
    }
  }
  assert.equal(kinds.size, 4); assert.equal(districts.size, 3);
});

test('input edges survive render-only frames and are consumed once', () => {
  const events = new EventTarget();
  Object.assign(globalThis, { window: events });
  const input = createInput(); const controller = createController();
  const key = (type: string, code: string) => events.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
  key('keydown', 'Space'); input.beginFrame(); controller.update(input.state, 1 / 60); input.consume();
  key('keyup', 'Space'); key('keydown', 'ArrowLeft'); input.beginFrame(); input.beginFrame();
  const intent = controller.update(input.state, 1 / 60);
  assert.ok(intent.wantOllie); assert.ok(intent.flickReady);
  input.consume(); assert.equal(controller.update(input.state, 1 / 60).wantOllie, false);
  assert.equal(input.state.flickReady, false);
  key('keydown', 'KeyW'); events.dispatchEvent(new Event('blur')); assert.equal(input.state.push, false);
  input.dispose();
  delete (globalThis as Record<string, unknown>).window;
});

// Geometry and Rapier can run without a GPU. Canvas operations only produce texture data.
const context = new Proxy({}, { get: () => () => {} });
Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });

test('two minutes of downhill physics stream continuously with bounded scene and colliders', async () => {
  await RAPIER.init();
  const scene = new THREE.Scene(), world = new RAPIER.World({ x: 0, y: -18, z: 0 });
  const ramp = createRamp(scene, world), player = createBoardPlayer(scene, world, ramp);
  const fog = scene.fog as THREE.Fog;
  assert.equal(fog.near, 120); assert.equal(fog.far, 300);
  // At the end of a chunk, generated terrain still extends beyond the visible horizon.
  assert.ok(RAMP.chunksAhead * RAMP.chunkLength > fog.far + 20);
  const tricks = createTrickSystem();
  const idle = { push: 0, steer: 0, crouch: false, crouchHold: 0, wantOllie: false, olliePower: 0, reset: false, flickDX: 0, flickDY: 0, flickReady: false };
  const dt = 1 / 120;
  world.timestep = dt;
  let previous = 0, jumps = 0, maxColliders = 0, contactChecks = 0;
  function verifyWheelContacts() {
    if (!player.grounded) return;
    player.mesh.updateMatrixWorld(true);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(player.mesh.quaternion);
    for (const z of [-BOARD.truckZ, BOARD.truckZ]) for (const x of [-BOARD.wheelX, BOARD.wheelX]) {
      const center = player.mesh.localToWorld(new THREE.Vector3(x, BOARD.wheelY, z));
      const origin = center.clone().addScaledVector(up, 0.1);
      const hit = world.castRayAndGetNormal(new RAPIER.Ray(origin, up.clone().negate()), 0.3, true, undefined, undefined, undefined, player.body);
      if (!hit) continue;
      const gap = hit.timeOfImpact - 0.1 - BOARD.wheelRadius;
      assert.ok(Math.abs(gap) < 0.002, `visible wheel gap ${gap}`);
      contactChecks++;
    }
  }
  for (let i = 0; i < 14400; i++) {
    const intent = { ...idle, wantOllie: i % 600 === 360, olliePower: 0.5 };
    player.update(dt, intent, tricks.state);
    try { world.step(); } catch (err) { throw new Error(`physics failed at frame ${i}, distance ${previous}, position ${player.position.toArray()}`, { cause: err }); }
    player.sync();
    assert.ok(Number.isFinite(player.position.y));
    assert.ok(player.mesh.matrix.compose(player.position, player.mesh.quaternion, new THREE.Vector3(1,1,1)).determinant() > 0.999);
    const distance = ramp.distance + player.position.clone().sub(ramp.anchor).dot(ramp.forward);
    assert.ok(distance >= previous - 0.05, `unexpected reset at frame ${i}, ${previous} -> ${distance}`);
    previous = distance;
    if (!player.grounded) jumps++;
    maxColliders = Math.max(maxColliders, world.colliders.len());
  }
  assert.ok(previous > 1000, `only traveled ${previous}`); assert.ok(jumps > 20);
  assert.ok(maxColliders < 60, `unbounded colliders: ${maxColliders}`);
  assert.ok(ramp.mesh.children.length <= 8);
  player.reset(ramp.spawn);
  assert.equal(ramp.distance, 0); assert.ok(player.forward.dot(ramp.forward) > 0.999);
  // Ride the first wedge at speed: it should launch rather than catch the front trucks.
  const jumpStart = ramp.spawn.clone().addScaledVector(ramp.forward, 80); jumpStart.x = 4.9;
  player.reset(jumpStart);
  player.body.setLinvel(ramp.forward.clone().multiplyScalar(20), true);
  let peakHeight = 0;
  for (let i = 0; i < 360; i++) {
    player.update(dt, idle, tricks.state); world.step(); player.sync();
    if (player.grounded && i > 40 && i < 75) verifyWheelContacts();
    peakHeight = Math.max(peakHeight, player.position.clone().sub(ramp.anchor).dot(ramp.surfaceNormal));
  }
  assert.ok(peakHeight > 1.5, `wedge did not launch: ${peakHeight}`);
  assert.ok(ramp.distance > 70, 'wedge should not cause a reset');

  player.reset(ramp.spawn);
  player.body.setLinvel(ramp.forward.clone().multiplyScalar(20), true);
  for (let i = 0; i < 180; i++) {
    player.update(dt, { ...idle, push: -1 }, tricks.state); world.step(); player.sync();
  }
  assert.ok(player.speed < 1, `braking did not stop the board: ${player.speed}`);
  assert.ok(player.velocity.dot(ramp.forward) >= -0.05, 'braking must not drive backwards');
  // Verify the actual body follows the speed curve, rather than just its pure helper.
  player.reset(ramp.spawn);
  let mphAt30 = 0;
  for (let i = 0; i < 60 * 120; i++) {
    player.update(dt, { ...idle, push: 1 }, tricks.state); world.step(); player.sync();
    assert.ok(player.speed * 2.23694 <= 199.001);
    if (i > 120 && i % 120 === 0) verifyWheelContacts();
    if (i === 30 * 120 - 1) mphAt30 = player.speed * 2.23694;
  }
  assert.ok(contactChecks > 100);
  assert.ok(mphAt30 > 180, `only ${mphAt30} mph after 30 seconds`);
  assert.ok(player.speed * 2.23694 > 195);

  // Full 180s are available in either direction while airborne.
  for (const steer of [-1, 1]) {
    player.reset(ramp.spawn.clone().addScaledVector(ramp.surfaceNormal, 12));
    player.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    let turned = false;
    for (let i = 0; i < 100; i++) {
      player.update(dt, { ...idle, steer }, tricks.state); world.step(); player.sync();
      if (player.forward.dot(ramp.forward) < -0.99) turned = true;
    }
    assert.ok(turned, `steer ${steer} could not rotate 180`);
  }

  player.reset(ramp.spawn.clone().addScaledVector(ramp.surfaceNormal, 8));
  player.body.setLinvel(ramp.forward.clone().multiplyScalar(20), true);
  let switchStance = false;
  for (let i = 0; i < 220; i++) {
    player.update(dt, { ...idle, steer: switchStance ? 0 : 1 }, tricks.state); world.step(); player.sync();
    if (player.forward.dot(ramp.forward) < -0.995) switchStance = true;
  }
  assert.ok(switchStance);
  assert.ok(player.forward.dot(ramp.forward) < -0.98, '180 stance should persist on landing');
  assert.ok(player.velocity.dot(ramp.forward) > 10, 'switch landing must preserve downhill momentum');

  // Catch and exit a generated physical rail, using the same player update as the game.
  player.reset(ramp.spawn);
  const rail = ramp.grindRails[0]!;
  assert.ok(rail);
  const railForward = rail.end.clone().sub(rail.start).normalize();
  const landing = rail.start.clone().addScaledVector(railForward, 2).addScaledVector(ramp.surfaceNormal, -0.05);
  player.reset(landing);
  player.body.setLinvel(railForward.clone().multiplyScalar(15).addScaledVector(ramp.surfaceNormal, -1), true);
  for (let i = 0; i < 20; i++) {
    player.update(dt, idle, tricks.state); world.step(); player.sync();
    assert.ok(player.grind.active, `failed to stay locked at frame ${i}`);
  }
  player.update(dt, { ...idle, wantOllie: true }, tricks.state); world.step(); player.sync();
  assert.equal(player.grind.active, false);
  assert.ok(player.velocity.dot(ramp.surfaceNormal) > 5);
  player.reset(ramp.spawn); assert.equal(player.grind.active, false);
  world.free();
});
