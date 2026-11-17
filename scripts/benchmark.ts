import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createRamp } from '../src/world/ramp.ts';
import { createBoardPlayer } from '../src/player/board.ts';
import { createTrickSystem } from '../src/player/tricks/tricks.ts';
import { steerAlongCourse } from './driveCourse.ts';
const context = new Proxy({}, { get: () => () => {} });
Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -18, z: 0 }); world.timestep = 1 / 120;
const scene = new THREE.Scene(), ramp = createRamp(scene, world), player = createBoardPlayer(scene, world, ramp);
const tricks = createTrickSystem();
const intent = { grabModifier: false, grabDX: 0, grabDY: 0, push: 1, steer: 0, crouch: false, crouchHold: 0, wantOllie: false, olliePower: 0, reset: false, flickDX: 0, flickDY: 0, flickReady: false };
// Match the game's pre-start suspension/physics warm-up, excluding first-use WASM work.
for (let tick=0; tick<90; tick++) {
  player.update(1/120,{...intent,push:0},tricks.state);world.step();player.sync(false);
}
player.render(1,1/60);
const split = process.argv.includes('--split-render');
const samples: number[] = [], streams: number[] = [], preparations: number[] = [];
const prepare = process.argv.includes("--prepare");
let preparedAt = -1;
for (let frame = 0; frame < 3600; frame++) {
  const distance = ramp.distance, before = performance.now();
  for (let tick = 0; tick < 2; tick++) {
    intent.steer=steerAlongCourse(player,ramp);
    player.update(1 / 120, intent, tricks.state); world.step();
    if (split) (player.sync as (paint: boolean) => void)(false); else player.sync();
  }
  if (split) (player as unknown as { render(alpha: number, dt: number): void }).render(1, 1 / 60);
  const elapsed = performance.now() - before;
  samples.push(elapsed); if (ramp.distance !== distance) streams.push(elapsed);
  if (prepare && preparedAt !== ramp.distance && player.position.clone().sub(ramp.anchor).dot(ramp.forward) > 30) {
    const start = performance.now(); const done = ramp.prepareNextChunk(2); preparations.push(performance.now() - start); if (done) preparedAt = ramp.distance;
  }
}
samples.sort((a,b) => a-b); streams.sort((a,b) => a-b); preparations.sort((a,b) => a-b);
console.log(JSON.stringify({
  mode: split ? 'render once per frame' : 'render every physics tick',
  simulationSeconds: 60, distanceMeters: Math.round(ramp.distance),
  meanFrameCpuMs: samples.reduce((a,b) => a+b,0) / samples.length,
  p95FrameCpuMs: samples[Math.floor(samples.length * 0.95)],
  p95StreamingFrameCpuMs: streams[Math.floor(streams.length * 0.95)],
  p95IdlePreparationCpuMs: preparations[Math.floor(preparations.length * 0.95)] ?? null,
  maxFrameCpuMs: samples.at(-1), note: 'CPU only; excludes browser/GPU rendering. Prepared chunks are measured separately to model idle work.',
}, null, 2));
world.free();
