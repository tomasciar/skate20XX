import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPumpCycle, PUSH_DURATION, PUSH_SPEED_LIMIT } from '../src/player/pump.ts';
import { createRiderMotion } from '../src/player/pose.ts';
import { createSkaterVisual } from '../src/player/skaterVisual.ts';
import { FOOT_Y } from '../src/player/dimensions.ts';

test('W never starts a new pump above 20 mph, even when held', () => {
  const pump = createPumpCycle();
  for (let i = 0; i < 1000; i++) pump.update(1 / 120, true, PUSH_SPEED_LIMIT + 0.01);
  assert.equal(pump.state.starts, 0); assert.equal(pump.state.weight, 0);
  pump.update(1 / 120, true, PUSH_SPEED_LIMIT);
  assert.ok(pump.state.active); assert.equal(pump.state.starts, 1);
});

test('a pump crossing 20 mph completes its full stroke and does not restart', () => {
  const pump = createPumpCycle(); const dt = 1 / 120;
  for (let i = 0; i < 36; i++) pump.update(dt, true, PUSH_SPEED_LIMIT - 1);
  const phase = pump.state.phase;
  for (let i = 0; i < 36; i++) pump.update(dt, true, PUSH_SPEED_LIMIT + 5);
  assert.ok(pump.state.active); assert.ok(pump.state.phase > phase);
  assert.ok(pump.state.weight > 0.99);
  for (let i = 0; i < 72; i++) pump.update(dt, true, PUSH_SPEED_LIMIT + 5);
  assert.equal(pump.state.active, false); assert.equal(pump.state.weight, 0);
  assert.ok(Math.abs(pump.state.phase - Math.PI * 2) < 1e-7);
  for (let i = 0; i < 240; i++) pump.update(dt, true, PUSH_SPEED_LIMIT + 5);
  assert.equal(pump.state.starts, 1);
  pump.update(dt, true, PUSH_SPEED_LIMIT - 1); assert.equal(pump.state.starts, 2);
});

test('repeated low-speed pushes return to the planted pose at every cycle boundary', () => {
  const pump = createPumpCycle();
  for (let cycle = 0; cycle < 4; cycle++) {
    for (let i = 0; i < PUSH_DURATION * 120; i++) pump.update(1 / 120, true, 5);
    assert.equal(pump.state.active, false); assert.equal(pump.state.weight, 0);
  }
  assert.equal(pump.state.starts, 4);
  pump.reset(); assert.equal(pump.state.starts, 0);
});

test('fast coasting sways with both feet planted and responds to carving and braking', () => {
  const motion = createRiderMotion();
  const samples: number[] = [];
  for (let i = 0; i < 600; i++) { motion.update(1 / 120, 0, 0, false, 0, 0, 70); samples.push(motion.state.sway); }
  assert.ok(Math.max(...samples) - Math.min(...samples) > 0.01);
  assert.ok(Math.max(...samples.map(Math.abs)) < 0.02);
  const cruiseFlex = motion.state.kneeLoad;
  for (let i = 0; i < 120; i++) motion.update(1 / 120, 0, 1, false, -1, 0, 70);
  assert.ok(motion.state.kneeLoad > cruiseFlex + 0.1);
  assert.equal(motion.state.push, 0);

  const visual = createSkaterVisual();
  for (let i = 0; i < 600; i++) {
    visual.setPose({ dt: 1 / 120, speed: 70, push: 1, verticalSpeed: 0, grinding: false,
      crouch: 0, lean: Math.sin(i / 100), airborne: false, bail: false, wheelRoll: i,
      boardSpin: { x: 0, y: 0, z: 0 } });
    for (const side of [-1, 1]) {
      const foot = visual.root.getObjectByName(`foot-${side}`)!;
      assert.equal(foot.position.y, FOOT_Y); assert.equal(foot.position.z, 0);
    }
  }
});
