import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { planChunk, districtAt, CHUNK_LENGTH, DISTRICTS, ENCOUNTER_KINDS } from '../src/world/generation.ts';
import { createRamp, RAMP } from '../src/world/ramp.ts';
import { createBoardPlayer } from '../src/player/board.ts';
import { createTrickSystem } from '../src/player/tricks/tricks.ts';
import { createInput } from '../src/input.ts';
import { BOARD } from '../src/player/dimensions.ts';
import { createController } from '../src/player/controller.ts';
import { createSoundEvents } from '../src/audio/events.ts';
import { steerAlongCourse, canJumpOnCourse } from '../scripts/driveCourse.ts';

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
  assert.equal(kinds.size, ENCOUNTER_KINDS.length); assert.equal(districts.size, DISTRICTS.length);
});

test('districts arrive in varied runs that always start with a sign and never repeat back to back', () => {
  assert.equal(districtAt(0).district, 'grove');
  const runs: number[] = [], seen = new Map<string, number>();
  let length = 0;
  for (let i = 0; i < 4000; i++) {
    const here = districtAt(i), plan = planChunk(i);
    assert.equal(plan.district, here.district); assert.equal(plan.entering, here.offset === 0);
    assert.equal(here.start + here.offset, i);
    if (here.offset === 0 && i > 0) {
      assert.notEqual(here.district, districtAt(i - 1).district, `district repeated at ${i}`);
      runs.push(length); length = 0;
    }
    length++; seen.set(here.district, (seen.get(here.district) ?? 0) + 1);
  }
  assert.ok(Math.min(...runs) >= 3 && Math.max(...runs) <= 7);
  assert.ok(new Set(runs).size >= 4, 'run lengths should vary');
  for (const district of DISTRICTS) assert.ok(seen.get(district)! > 4000 / DISTRICTS.length * 0.75, `${district} is rare`);
  // The first two kilometres already visit every district.
  assert.equal(new Set(Array.from({ length: 30 }, (_, i) => districtAt(i).district)).size, DISTRICTS.length);
});

test('input edges survive render-only frames and are consumed once', () => {
  const events = new EventTarget();
  Object.assign(globalThis, { window: events });
  const input = createInput(); const controller = createController();
  const key = (type: string, code: string) => events.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
  key('keydown', 'Space'); input.beginFrame(); controller.update(input.state, 1 / 60); input.consume();
  key('keyup', 'Space'); key('keydown', 'ShiftLeft'); key('keydown', 'ArrowLeft'); input.beginFrame(); input.beginFrame();
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
  const ramp = createRamp(scene, world, {startPlatform:false}), player = createBoardPlayer(scene, world, ramp);
  const fog = scene.fog as THREE.Fog;
  assert.equal(fog.near, 120); assert.equal(fog.far, 300);
  // At the end of a chunk, generated terrain still extends beyond the visible horizon.
  assert.ok(RAMP.chunksAhead * RAMP.chunkLength > fog.far + 20);
  const tricks = createTrickSystem();
  const idle = { grabModifier: false, grabDX: 0, grabDY: 0, push: 0, steer: 0, crouch: false, crouchHold: 0, wantOllie: false, olliePower: 0, reset: false, flickDX: 0, flickDY: 0, flickReady: false };
  const dt = 1 / 120;
  world.timestep = dt;
  let previous = 0, jumps = 0, maxStaticColliders = 0, maxColliders = 0, contactChecks = 0;
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
    const intent = { ...idle, steer:steerAlongCourse(player,ramp),wantOllie: i % 600 === 360 && canJumpOnCourse(player,ramp), olliePower: 0.5 };
    player.update(dt, intent, tricks.state);
    try { world.step(); } catch (err) { throw new Error(`physics failed at frame ${i}, distance ${previous}, position ${player.position.toArray()}`, { cause: err }); }
    player.sync();
    assert.ok(Number.isFinite(player.position.y));
    assert.ok(player.mesh.matrix.compose(player.position, player.mesh.quaternion, new THREE.Vector3(1,1,1)).determinant() > 0.999);
    const distance = ramp.distance + player.position.clone().sub(ramp.anchor).dot(ramp.forward);
    assert.ok(distance >= previous - 0.05, `unexpected reset at frame ${i}, ${previous} -> ${distance}`);
    previous = distance;
    if (!player.grounded) jumps++;
    let staticColliders=0;world.colliders.forEach(c=>{if(c.parent()?.isFixed())staticColliders++;});
    maxStaticColliders=Math.max(maxStaticColliders,staticColliders);
    maxColliders = Math.max(maxColliders, world.colliders.len());
  }
  assert.ok(previous > 1000, `only traveled ${previous}`); assert.ok(jumps > 20);
  assert.ok(player.ollieCount>0,'successful ollies must be reported to audio');
  const live = RAMP.chunksBehind + 1 + RAMP.chunksAhead, full = live + RAMP.prepareLead;
  assert.ok(maxStaticColliders <= full + 3, `unbounded static colliders: ${maxStaticColliders}`);
  assert.ok(maxColliders <= (full+3)*7+1, `unbounded colliders including movable cones: ${maxColliders}`);
  assert.ok(ramp.mesh.children.length <= full + 3);
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
  assert.equal(player.ollieCount,0,'rolling off a kicker must not report a popped ollie');
  assert.ok(ramp.distance > 70, 'wedge should not cause a reset');

  player.reset(ramp.spawn);
  player.body.setLinvel(ramp.forward.clone().multiplyScalar(20), true);
  for (let i = 0; i < 180; i++) {
    player.update(dt, { ...idle, push: -1 }, tricks.state); world.step(); player.sync();
  }
  assert.ok(player.speed < 1, `braking did not stop the board: ${player.speed}`);
  assert.ok(player.velocity.dot(ramp.forward) >= -0.05, 'braking must not drive backwards');
  // Preserve the fast downhill feel while allowing gravity and resistance to set the speed.
  player.reset(ramp.spawn);
  let mphAt40 = 0;
  const coastSounds=createSoundEvents();
  for (let i = 0; i < 60 * 120; i++) {
    player.update(dt, { ...idle, push: 1,steer:steerAlongCourse(player,ramp) }, tricks.state); world.step(); player.sync();
    const sounds=coastSounds.step(dt,{speed:player.speed,grounded:player.grounded,grinding:player.grind.active,
      verticalSpeed:player.velocity.dot(ramp.surfaceNormal),ollieCount:player.ollieCount,resetCount:player.resetCount,
      braking:false,steer:0,pumpPhase:player.pump.phase,pumpStarts:player.pump.starts,trick:null,bail:player.crashed});
    assert.ok(sounds.every(sound=>sound.kind!=='ollie' && sound.kind!=='land'),`false jump/landing sound while coasting at frame ${i}`);
    assert.ok(Number.isFinite(player.speed) && player.speed>=0);
    if (i > 120 && i % 120 === 0) verifyWheelContacts();
    if (i === 40 * 120 - 1) mphAt40 = player.speed * 2.23694;
  }
  assert.ok(contactChecks > 100);
  assert.ok(mphAt40 > 180, `only ${mphAt40} mph after 40 seconds`);
  assert.ok(player.speed * 2.23694 > 175);

  // Broad curves should be negotiable above 200 mph with gentle corrections.
  player.reset(ramp.spawn);
  player.body.setLinvel(ramp.forward.clone().multiplyScalar(85),true);
  let fastest=0,maxOffset=0,maxSteering=0;
  for(let i=0;i<1440;i++) {
    const steer=steerAlongCourse(player,ramp);
    maxSteering=Math.max(maxSteering,Math.abs(steer));
    player.update(dt,{...idle,steer,crouch:true,crouchHold:1},tricks.state);world.step();player.sync();
    if(i%2===0)ramp.prepareNextChunk(4);
    fastest=Math.max(fastest,player.speed*2.23694);
    maxOffset=Math.max(maxOffset,Math.abs(ramp.roadOffset!(player.position)));
    assert.equal(player.crashed,false,'gentle road bends should remain rideable at high speed');
  }
  assert.ok(fastest>200);
  assert.ok(maxOffset<2.2,`drifted out of the clear corridor: ${maxOffset}`);
  assert.ok(maxSteering<0.65,`bend required an abrupt steering correction: ${maxSteering}`);

  // Carrying speed above the old cap must decelerate smoothly on the road and in the air.
  for(const height of [0,20]) {
    player.reset(ramp.spawn.clone().addScaledVector(ramp.surfaceNormal,height));
    for(let i=0;i<(height===0?90:1);i++) { player.update(dt,idle,tricks.state);world.step();player.sync(); }
    player.body.setLinvel(ramp.forward.clone().multiplyScalar(120),true);
    player.update(dt,idle,tricks.state);world.step();player.sync();
    assert.ok(player.speed>115,`high-speed motion was clamped at height ${height}: ${player.speed}`);
    assert.equal(player.crashed,false);
  }

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
  const rail = ramp.grindRails.find(rail=>Math.abs(rail.end.x-rail.start.x)>0.3) ?? ramp.grindRails[0]!;
  assert.ok(rail);
  const railForward = rail.end.clone().sub(rail.start).normalize();
  const landing = rail.start.clone().addScaledVector(railForward, 2).addScaledVector(ramp.surfaceNormal, -0.05);
  player.reset(landing);
  player.body.setLinvel(railForward.clone().multiplyScalar(15).addScaledVector(ramp.surfaceNormal, -1), true);
  for (let i = 0; i < 20; i++) {
    player.update(dt, idle, tricks.state); world.step(); player.sync();
    assert.ok(player.grind.active, `failed to stay locked at frame ${i}`);
    assert.ok(player.forward.dot(railForward)>0.9999,'board must align with an angled rail');
  }
  player.update(dt, { ...idle, wantOllie: true }, tricks.state); world.step(); player.sync();
  assert.equal(player.grind.active, false);
  assert.equal(player.ollieCount,1,'ollie exits from rails must report one pop');
  assert.ok(player.velocity.dot(ramp.surfaceNormal) > 5);
  player.reset(ramp.spawn); assert.equal(player.grind.active, false);
  // Presentation interpolation never changes the simulated pose, including an origin shift.
  player.reset(ramp.spawn);
  const initial = player.position.clone();
  player.body.setLinvel(ramp.forward.clone().multiplyScalar(30), true);
  player.update(dt, idle, tricks.state); world.step(); player.sync(false);
  const current = player.position.clone();
  for (const alpha of [0, 0.25, 0.5, 1]) {
    player.render(alpha, 0);
    assert.ok(player.renderPosition.distanceTo(initial.clone().lerp(current, alpha)) < 1e-6);
    assert.ok(player.position.distanceTo(current) < 1e-8);
  }
  player.reset(ramp.spawn.clone().addScaledVector(ramp.forward, 69.9));
  const beforeShift = player.position.clone();
  player.body.setLinvel(ramp.forward.clone().multiplyScalar(60), true);
  player.update(dt, idle, tricks.state); world.step(); player.sync(false);
  assert.ok(player.originShift.length() > 69);
  const rebasedPrevious = beforeShift.add(player.originShift);
  player.render(0.5, 0);
  assert.ok(player.renderPosition.distanceTo(rebasedPrevious.clone().lerp(player.position, 0.5)) < 1e-5);
  assert.ok(player.renderPosition.distanceTo(player.position) < 1);

  player.reset(ramp.spawn);
  const cachedRails = ramp.grindRails;
  assert.equal(ramp.grindRails, cachedRails, 'rail reads should reuse the cached data');
  assert.equal(ramp.mesh.children.length, live);
  ramp.prepareNextChunk();
  assert.equal(ramp.mesh.children.length, live + 1);
  // Preparation resumes across many small time slices, as it does between rendered frames.
  let slices = 0;
  while (!ramp.prepareNextChunk(0)) { slices++; assert.ok(slices < 5000, 'incremental preparation stalled'); }
  assert.ok(slices > 20, 'chunk preparation should be spread over several slices');
  assert.equal(ramp.mesh.children.length, full);
  const preparedRails = ramp.grindRails;
  ramp.prepareNextChunk();
  assert.equal(ramp.mesh.children.length, full, 'a full lead must not build further chunks');
  assert.equal(ramp.grindRails, preparedRails);
  ramp.scroll(70);
  assert.ok(ramp.mesh.children.length <= full + 1);
  assert.equal(ramp.grindRails, ramp.grindRails);
  for (const chunk of ramp.mesh.children) {
    assert.equal(chunk.matrixAutoUpdate, false);
    assert.equal(chunk.matrix.elements[14], chunk.position.z, 'static chunk matrix must follow origin shifts');
  }
  world.free();
});
