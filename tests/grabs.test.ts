import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createInput } from '../src/input.ts';
import { createController } from '../src/player/controller.ts';
import { classifyGrab, GRABS } from '../src/player/grabs.ts';
import { createTrickSystem } from '../src/player/tricks.ts';
import { createSkaterVisual } from '../src/player/skaterVisual.ts';
import { FOOT_Y } from '../src/player/dimensions.ts';

test('Shift uses held arrows for grabs without changing push or steering or leaking flicks', () => {
  const events = new EventTarget(); Object.assign(globalThis, { window: events });
  const input = createInput(), controller = createController();
  const key = (type: string, code: string) => events.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
  key('keydown', 'KeyW'); key('keydown', 'KeyD');
  key('keydown', 'ArrowUp'); key('keydown', 'ShiftLeft'); input.beginFrame();
  let intent = controller.update(input.state, 1 / 120);
  assert.equal(intent.push, 1); assert.equal(intent.steer, 1);
  assert.equal(intent.grabModifier, true); assert.equal(intent.grabDY, -1); assert.equal(intent.flickReady, false);
  input.consume(); input.beginFrame();
  assert.equal(input.state.grabDY, -1, 'held grab must survive physics consumption');
  key('keydown', 'ShiftRight'); key('keyup', 'ShiftLeft'); input.beginFrame(); assert.ok(input.state.grabModifier);
  key('keyup', 'ShiftRight'); input.beginFrame(); intent = controller.update(input.state, 1 / 120);
  assert.equal(intent.grabModifier, false); assert.equal(intent.grabDY, 0); assert.equal(intent.flickReady, false);
  key('keyup', 'ArrowUp'); key('keydown', 'ArrowLeft'); input.beginFrame();
  assert.equal(input.state.flickReady, true);
  key('keydown', 'ShiftLeft'); events.dispatchEvent(new Event('blur'));
  assert.equal(input.state.grabModifier, false); assert.equal(input.state.grabDX, 0);
  input.dispose(); delete (globalThis as Record<string, unknown>).window;
});

test('grab selection and lifecycle require air and never overlap flip tricks', () => {
  assert.equal(classifyGrab(0,-1)?.id, 'nosegrab'); assert.equal(classifyGrab(0,1)?.id, 'tailgrab');
  assert.equal(classifyGrab(-1,0)?.id, 'melon'); assert.equal(classifyGrab(1,0)?.id, 'indy');
  assert.equal(classifyGrab(0,0), null);
  const tricks = createTrickSystem();
  tricks.setGrab(1,0,true,false); assert.equal(tricks.state.grab, null);
  tricks.setGrab(1,0,true,true); assert.equal(tricks.state.grab?.id, 'indy');
  tricks.tryFlick(-80,0,true); assert.equal(tricks.state.active, null);
  tricks.update(0.5,false,1,20); assert.equal(tricks.state.message, 'Indy Grab');
  assert.ok(tricks.state.grabTime > 0);
  tricks.setGrab(1,0,false,true); assert.equal(tricks.state.grab, null);
  tricks.tryFlick(-80,0,true); assert.ok(tricks.state.active);
  tricks.setGrab(1,0,true,true); assert.equal(tricks.state.grab, null);
  tricks.reset(); tricks.setGrab(0,-1,true,true); tricks.update(0.01,true,1,20);
  assert.equal(tricks.state.grab, null); assert.equal(tricks.state.lastLanded, 'Nose Grab');
  tricks.setGrab(0,-1,true,true); tricks.reset(); assert.equal(tricks.state.grab, null);
});

test('all grab hands reach the board with tucked feet, and landing restores wheel contact height', () => {
  for (const grab of Object.values(GRABS)) {
    const visual = createSkaterVisual();
    const pose = { dt: 1 / 120, speed: 25, push: 0, verticalSpeed: -1, grinding: false,
      crouch: 0, lean: 0, airborne: true, bail: false, wheelRoll: 0,
      boardSpin: { x: 0, y: 0, z: 0 }, grab };
    for (let i = 0; i < 240; i++) visual.setPose(pose);
    visual.root.updateMatrixWorld(true);
    const hand = visual.root.getObjectByName(`hand-${grab.hand}`)!;
    const actual = hand.getWorldPosition(new THREE.Vector3());
    // Convert rider-space grip (+X is nose) to the board's -Z forward space.
    const expected = new THREE.Vector3(grab.grip.x, grab.grip.y + visual.board.position.y, grab.grip.z).applyAxisAngle(new THREE.Vector3(0,1,0), Math.PI / 2);
    assert.ok(actual.distanceTo(expected) < 0.025, `${grab.name} hand missed by ${actual.distanceTo(expected)}`);
    assert.ok(visual.board.position.y > 0.27);
    for (const side of [-1,1]) {
      const foot = visual.root.getObjectByName(`foot-${side}`)!;
      assert.ok(Math.abs(foot.position.y - FOOT_Y - visual.board.position.y) < 1e-6);
    }
    visual.setPose({ ...pose, airborne: false, grab: null });
    assert.equal(visual.board.position.y, 0, 'board must be on its wheels immediately on landing');
    visual.resetPose(); assert.equal(visual.board.position.y, 0);
  }
});
