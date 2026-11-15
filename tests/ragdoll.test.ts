import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createSkaterVisual } from '../src/player/skaterVisual.ts';
import { createRagdoll } from '../src/player/ragdoll.ts';
import { createBoardPlayer } from '../src/player/board.ts';
import { createRamp } from '../src/world/ramp.ts';
import { GRABS } from '../src/player/grabs.ts';
import { createTrickSystem } from '../src/player/tricks.ts';

const context = new Proxy({}, { get: () => () => {} });
Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
const dt = 1/120;
const idle = { grabModifier: false, grabDX:0, grabDY:0, push:0, steer:0, crouch:false, crouchHold:0, wantOllie:false, olliePower:0, reset:false, flickDX:0, flickDY:0, flickReady:false };
const pose = {dt,speed:20,push:0,verticalSpeed:0,grinding:false,crouch:0,lean:0,airborne:false,bail:false,wheelRoll:0,boardSpin:{x:0,y:0,z:0}};

function checkAnchors(world: RAPIER.World, tolerance = 0.08) {
  world.impulseJoints.forEach(joint => {
    const a = joint.body1(), b = joint.body2();
    const point = (body: RAPIER.RigidBody, local: RAPIER.Vector) => {
      const q = body.rotation(), t = body.translation();
      return new THREE.Vector3(local.x,local.y,local.z).applyQuaternion(new THREE.Quaternion(q.x,q.y,q.z,q.w)).add(new THREE.Vector3(t.x,t.y,t.z));
    };
    const separation = point(a,joint.anchor1()).distanceTo(point(b,joint.anchor2()));
    assert.ok(separation < tolerance, `joint ${a.userData} -> ${b.userData} came apart by ${separation}`);
  });
}

test('ragdoll uses the rider model, retains momentum, stays joined, and cleans up', async () => {
  await RAPIER.init();
  const scene = new THREE.Scene(), world = new RAPIER.World({x:0,y:-18,z:0}); world.timestep = dt;
  const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-0.5,0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(200,0.5,200),floor);
  const visual = createSkaterVisual(); visual.root.position.set(0,0.15,0); scene.add(visual.root);
  for (let i=0;i<120;i++) visual.setPose(pose);
  const rag = createRagdoll(scene,world);
  const originalCcdSubsteps = world.maxCcdSubsteps;
  for (const speed of [0,20,89]) {
    rag.start(visual.captureRagdoll(),new THREE.Vector3(0,0,-speed),new THREE.Vector3(0,1,0));
    assert.equal(rag.bodyCount,11); assert.equal(world.impulseJoints.len(),10);
    assert.ok(Math.abs(rag.velocity.z + speed) < 0.01);
    checkAnchors(world,0.001);
    for (let i=0;i<240;i++) {
      rag.beginStep(); world.step(); rag.sync(); rag.render(0.5);
      assert.ok(Number.isFinite(rag.focus.y));
      assert.ok(rag.velocity.length() < speed + 35, 'ragdoll gained explosive energy');
      try { checkAnchors(world); } catch (error) { throw new Error(`speed ${speed} frame ${i}: ${String(error)}`); }
    }
    const old = rag.focus.clone(); rag.shift(new THREE.Vector3(0,10,70)); rag.sync();
    assert.ok(rag.focus.distanceTo(old.add(new THREE.Vector3(0,10,70))) < 0.001);
    checkAnchors(world);
    rag.clear(); assert.equal(world.bodies.len(),1); assert.equal(world.colliders.len(),1); assert.equal(world.impulseJoints.len(),0);
    assert.equal(rag.active,false); assert.equal(scene.getObjectByName('crash-ragdoll'),undefined);
  }
  // Tucked and extended grabs must transfer to physics without snapping joints apart.
  for (const grab of [GRABS.indy,GRABS.tomahawk,GRABS.pushout,GRABS.nosebone]) {
    for (let i=0;i<240;i++) visual.setPose({...pose,airborne:true,grab});
    rag.start(visual.captureRagdoll(),new THREE.Vector3(0,0,-30),new THREE.Vector3(0,1,0));
    for (let i=0;i<120;i++) { rag.beginStep();world.step();rag.sync();try { checkAnchors(world); } catch(error) { throw new Error(`${grab.id} frame ${i}: ${String(error)}`); } }
    rag.clear();
  }
  rag.clear(); assert.equal(world.maxCcdSubsteps,originalCcdSubsteps);
  world.free();
});

test('obstacle crashes release rider and board, ignore controls, and allow manual and automatic recovery', async () => {
  await RAPIER.init();
  const scene = new THREE.Scene(), world = new RAPIER.World({x:0,y:-18,z:0}); world.timestep = dt;
  const ramp = createRamp(scene,world,{startPlatform:false}), player = createBoardPlayer(scene,world,ramp), tricks = createTrickSystem();
  for (let i=0;i<120;i++) { player.update(dt,idle,tricks.state);world.step();player.sync(); }
  const bodies = world.bodies.len(), colliders = world.colliders.len();
  const wall = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const position = player.position.clone().addScaledVector(ramp.forward,4).addScaledVector(ramp.surfaceNormal,0.5);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-14*Math.PI/180);
  wall.setTranslation(position,true);wall.setRotation(q,true);
  world.createCollider(RAPIER.ColliderDesc.cuboid(2,1,0.15),wall);
  player.body.setLinvel(ramp.forward.clone().multiplyScalar(20),true);
  for (let i=0;i<120 && !player.crashed;i++) { player.update(dt,idle,tricks.state);world.step();player.sync(); }
  assert.ok(player.crashed,'wall impact did not trigger a crash');
  assert.equal(world.bodies.len(),bodies+12); assert.equal(world.impulseJoints.len(),10);
  assert.equal(tricks.state.message,'Bail!');
  for (let i=0;i<60;i++) {
    player.update(dt,{...idle,push:1,steer:1,wantOllie:true},tricks.state); world.step();player.sync();
    assert.ok(player.crashed);checkAnchors(world);
  }
  player.update(dt,{...idle,reset:true},tricks.state);
  assert.equal(player.crashed,false); assert.equal(world.impulseJoints.len(),0); assert.equal(world.bodies.len(),bodies+1);
  world.removeRigidBody(wall); tricks.reset();
  // Failed tricks use the same crash path; recovery also works without pressing R.
  const resetCount=player.resetCount; tricks.state.bail=true;
  player.update(dt,idle,tricks.state);world.step();player.sync(); assert.ok(player.crashed);
  tricks.clearBail();
  for (let i=0;i<400 && player.crashed;i++) { player.update(dt,idle,tricks.state);world.step();player.sync(); }
  assert.equal(player.crashed,false); assert.equal(player.resetCount,resetCount+1);
  assert.equal(world.bodies.len(),bodies); assert.equal(world.colliders.len(),colliders); assert.equal(world.impulseJoints.len(),0);
  // Ordinary small bumps stay rideable, while a genuinely hard drop ragdolls.
  player.reset(ramp.spawn); tricks.reset();
  for (let i=0;i<90;i++) { player.update(dt,idle,tricks.state); world.step();player.sync(); }
  const bump = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  bump.setTranslation(player.position.clone().addScaledVector(ramp.forward,0.45),true); bump.setRotation(q,true);
  world.createCollider(RAPIER.ColliderDesc.cuboid(1,0.5,0.1),bump);
  player.body.setLinvel(ramp.forward.clone().multiplyScalar(2),true);
  player.update(dt,idle,tricks.state); world.step();player.sync();
  assert.equal(player.crashed,false,'small bump incorrectly triggered a ragdoll');
  world.removeRigidBody(bump);
  player.reset(ramp.spawn.clone().addScaledVector(ramp.surfaceNormal,18));
  for (let i=0;i<300 && !player.crashed;i++) { player.update(dt,idle,tricks.state);world.step();player.sync(); }
  assert.ok(player.crashed,'hard landing did not trigger a ragdoll');
  player.reset(ramp.spawn); assert.equal(world.impulseJoints.len(),0);
  world.free();
});
