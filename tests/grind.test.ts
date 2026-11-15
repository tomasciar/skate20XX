import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GRIND_HEIGHT } from '../src/player/dimensions.ts';
import { createGrindSystem } from '../src/player/grind.ts';
import { approachTopSpeed, MAX_SPEED, MPH_PER_MPS } from '../src/player/speed.ts';
const normal = new THREE.Vector3(0, 1, 0), forward = new THREE.Vector3(0, 0, -1);
const rails = [{ id: 'test', start: new THREE.Vector3(0, 1, 0), end: new THREE.Vector3(0, 1, -20) }];

test('speed climbs quickly to 180 then approaches 199 with diminishing gains', () => {
  let speed = 0, at10 = 0, at20 = 0;
  for (let i = 1; i <= 120 * 120; i++) {
    const next = approachTopSpeed(speed, 1 / 120, true);
    assert.ok(next >= speed && next <= MAX_SPEED);
    speed = next;
    if (i === 10 * 120) at10 = speed;
    if (i === 20 * 120) at20 = speed;
    if (i === 25 * 120) assert.ok(speed * MPH_PER_MPS >= 180);
  }
  assert.ok(at10 > at20 - at10);
  assert.ok(speed * MPH_PER_MPS > 198);
});

test('landing aligned on a rail locks trucks and keeps longitudinal momentum', () => {
  const grind = createGrindSystem(), position = new THREE.Vector3(0.15, 1.25, -3), velocity = new THREE.Vector3(0, -2, -15);
  assert.ok(grind.update(1 / 120, position, velocity, forward, normal, rails, 0, false, false, true));
  assert.ok(grind.state.active); assert.equal(position.x, 0); assert.equal(position.y, 1 + GRIND_HEIGHT);
  assert.ok(velocity.z < -14.9); assert.equal(velocity.y, 0);
  assert.ok(grind.state.meters > 0);
});

test('rails require a top landing rather than snapping from the road or side', () => {
  for (const position of [new THREE.Vector3(1, 1.2, -3), new THREE.Vector3(0, 0.2, -3), new THREE.Vector3(0, 3, -3)]) {
    const grind = createGrindSystem();
    assert.equal(grind.update(1 / 120, position, new THREE.Vector3(0, -1, -15), forward, normal, rails, 0, false, false, true), false);
  }
  const grind = createGrindSystem();
  assert.equal(grind.update(1 / 120, new THREE.Vector3(0, 1.2, -3), new THREE.Vector3(0, 3, -15), forward, normal, rails, 0, false, false, true), false);
});

test('grind ollie exits, cooldown prevents reattachment, and rail ends release', () => {
  const grind = createGrindSystem(), position = new THREE.Vector3(0, 1.15, -3), velocity = new THREE.Vector3(0, -1, -15);
  grind.update(1 / 120, position, velocity, forward, normal, rails, 0, false, false, true);
  grind.update(1 / 120, position, velocity, forward, normal, rails, 0, true, false, true);
  assert.equal(grind.state.active, false); assert.ok(velocity.y > 6);
  velocity.y = -1;
  grind.update(1 / 120, position, velocity, forward, normal, rails, 0, false, false, true);
  assert.equal(grind.state.active, false);
  grind.reset(); position.set(0, 1.15, -19.9);
  grind.update(1 / 120, position, velocity, forward, normal, rails, 0, false, false, true);
  position.z = -20.1;
  grind.update(1 / 120, position, velocity, forward, normal, rails, 0, false, false, true);
  assert.equal(grind.state.active, false); assert.equal(grind.state.message, 'Grind complete');
});

test('overbalancing drops off a rail; reverse aligned grinds work', () => {
  const grind = createGrindSystem(), position = new THREE.Vector3(0, 1.15, -3), velocity = new THREE.Vector3(0, -1, 15);
  grind.update(1 / 120, position, velocity, forward.clone().negate(), normal, rails, 0, false, false, true);
  assert.ok(grind.state.active); assert.ok(velocity.z > 14);
  for (let i = 0; i < 80; i++) grind.update(1 / 120, position, velocity, forward, normal, rails, 1, false, false, false);
  assert.equal(grind.state.active, false); assert.equal(grind.state.message, 'Slipped off');
});

test('graded rails constrain the trucks and ollie exit to their own surface normal',()=>{
  for(const pitch of [-0.2,0.2]) {
    const tangent=forward.clone().applyAxisAngle(new THREE.Vector3(1,0,0),pitch);
    const up=normal.clone().applyAxisAngle(new THREE.Vector3(1,0,0),pitch);
    const rail={id:'grade',start:new THREE.Vector3(0,3,0),end:tangent.clone().multiplyScalar(20).add(new THREE.Vector3(0,3,0)),normal:up};
    const position=rail.start.clone().addScaledVector(tangent,3).addScaledVector(up,GRIND_HEIGHT+0.02);
    const velocity=tangent.clone().multiplyScalar(18).addScaledVector(up,-1), grind=createGrindSystem();
    assert.ok(grind.update(1/120,position,velocity,tangent,normal,[rail],0,false,false,true));
    assert.ok(Math.abs(position.clone().sub(rail.start).dot(up)-GRIND_HEIGHT)<1e-6);
    assert.ok(Math.abs(velocity.dot(up))<1e-6);
    grind.update(1/120,position,velocity,tangent,normal,[rail],0,true,false,true);
    assert.ok(Math.abs(velocity.dot(up)-6.5)<1e-6);
  }
});
