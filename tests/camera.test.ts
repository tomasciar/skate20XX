import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createChaseCamera } from '../src/camera/chase.ts';

test('follow direction is fixed to the course and follows position without orbiting', () => {
  const camera = new THREE.PerspectiveCamera();
  const course = new THREE.Vector3(0, -0.24, -0.97);
  const chase = createChaseCamera(camera, course);
  const start = new THREE.Vector3(0, 20, 0);
  chase.snap(start);
  const offset = camera.position.clone().sub(start);
  const rotation = camera.quaternion.clone();
  // The captured direction must stay fixed even if its source changes.
  course.set(1, 0, 0);
  chase.update(1 / 60, start);
  assert.ok(camera.position.clone().sub(start).distanceTo(offset) < 1e-10);
  assert.ok(camera.quaternion.angleTo(rotation) < 1e-7);
  const moved = new THREE.Vector3(5, 18, -12);
  for (let i = 0; i < 300; i++) chase.update(1 / 60, moved);
  assert.ok(camera.position.clone().sub(moved).distanceTo(offset) < 1e-7);
});

test('streaming moves the camera with the rider without a camera jump', () => {
  const camera = new THREE.PerspectiveCamera();
  const chase = createChaseCamera(camera, new THREE.Vector3(0, 0, -1));
  const target = new THREE.Vector3(3, 10, -65);
  chase.snap(target);
  const offset = camera.position.clone().sub(target);
  const shift = new THREE.Vector3(0, 17, 68);
  chase.shift(shift); target.add(shift); chase.update(1 / 60, target);
  assert.ok(camera.position.clone().sub(target).distanceTo(offset) < 1e-10);
});

test('camera eases around road bends and keeps its framing across lateral rebases and resets',()=>{
  const camera=new THREE.PerspectiveCamera(),straight=new THREE.Vector3(0,0,-1);
  const chase=createChaseCamera(camera,straight),target=new THREE.Vector3(0,20,0);
  chase.snap(target);
  const curve=new THREE.Vector3(0.18,0,-1).normalize();
  for(let i=0;i<300;i++) {
    const before=camera.quaternion.clone();chase.update(1/60,target,curve);
    assert.ok(camera.quaternion.angleTo(before)<0.02,'road heading changed the camera abruptly');
  }
  const offset=camera.position.clone().sub(target);
  assert.ok(offset.clone().setY(0).normalize().dot(curve)<-0.99999);
  assert.ok(Math.abs(offset.y-5.6)<1e-8);
  const rebase=new THREE.Vector3(35,15,68);target.add(rebase);chase.shift(rebase);
  chase.update(1/60,target,curve);
  assert.ok(camera.position.clone().sub(target).distanceTo(offset)<0.00001);
  chase.snap(target,straight);
  assert.ok(Math.abs(camera.position.x-target.x)<1e-8);
});
