import { LANDING_SPEED } from '../src/player/speed.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeLoop } from '../src/audio/textures.ts';
import type { RideTexture } from '../src/audio/textures.ts';
import { createSoundEvents } from '../src/audio/events.ts';
import type { RideAudioState, RideSound } from '../src/audio/events.ts';
import { createGameAudio, readAudioPreferences, rideMix, synthesizeEffect } from '../src/audio/sound.ts';

const base: RideAudioState = { speed: 12, grounded: true, grinding: false, verticalSpeed: 0,
  braking: false, steer: 0, pumpPhase: 0, pumpStarts: 0, trick: null, bail: false, resetCount: 1, ollieCount: 0 };
const dt = 1 / 120;

test('sound events follow actual jumps and impacts without retriggering on held states', () => {
  const events = createSoundEvents();
  assert.deepEqual(events.step(dt, base), []);
  const air = { ...base, grounded: false, verticalSpeed: 7, ollieCount: 1 };
  assert.deepEqual(events.step(dt, air).map(e => e.kind), ['ollie']);
  for (let i = 0; i < 30; i++) assert.deepEqual(events.step(dt, { ...air, verticalSpeed: -8 }), []);
  const landing = events.step(dt, base); assert.equal(landing[0]!.kind, 'land'); assert.ok(landing[0]!.strength > 0.5);
  assert.deepEqual(events.step(dt, base), []);
  // Skimming just above the road and settling back is silent, however long it lasted.
  for (const fall of [-1, -3, -(LANDING_SPEED - 0.1)]) {
    for (let i = 0; i < 40; i++) assert.deepEqual(events.step(dt, { ...base, grounded: false, verticalSpeed: fall }), []);
    assert.deepEqual(events.step(dt, base), [], `a ${fall} m/s touchdown should be silent`);
  }
  // The smallest real ollie comes down at about 5 m/s and is heard.
  for (let i = 0; i < 40; i++) events.step(dt, { ...base, grounded: false, verticalSpeed: -5 });
  assert.deepEqual(events.step(dt, base).map(e => e.kind), ['land']);
  assert.deepEqual(events.step(dt, { ...base, grinding: true }).map(e => e.kind), ['grindOn']);
  assert.deepEqual(events.step(dt, { ...base, grinding: true }), []);
  assert.deepEqual(events.step(dt, base).map(e => e.kind), ['grindOff']);
});

test('pushes play at foot contact, tricks and bails play once, resets are silent', () => {
  const events = createSoundEvents(); events.step(dt, base);
  const pump = { ...base, pumpStarts: 1, pumpPhase: Math.PI };
  assert.deepEqual(events.step(dt, pump), []);
  const contact = { ...pump, pumpPhase: Math.PI * 1.6 };
  assert.deepEqual(events.step(dt, contact).map(e => e.kind), ['push']);
  assert.deepEqual(events.step(dt, contact), []);
  const trick = { ...contact, trick: 'kickflip' };
  assert.deepEqual(events.step(dt, trick).map(e => e.kind), ['trick']);
  assert.deepEqual(events.step(dt, trick), []);
  assert.deepEqual(events.step(dt, { ...trick, bail: true }).map(e => e.kind), ['bail']);
  assert.deepEqual(events.step(dt, { ...trick, bail: true }), []);
  assert.deepEqual(events.step(dt, { ...base, resetCount: 2 }), []);
  // Contact chatter should never sound like repeated landings.
  events.step(dt, { ...base, resetCount: 2, grounded: false, verticalSpeed: -0.5 });
  assert.deepEqual(events.step(dt, { ...base, resetCount: 2 }), []);
});

test('changing grades and brief wheel-contact losses cannot produce a pop sound without a physics ollie',()=>{
  const events=createSoundEvents();events.step(dt,base);
  // Captured on the rolling course without pressing Space: the old detector treated
  // these course-relative speeds as jumps, although the board was millimetres above support.
  for(const verticalSpeed of [9.85,13.33,6.19]) {
    const skim={...base,grounded:false,verticalSpeed};
    for(let i=0;i<20;i++)assert.deepEqual(events.step(dt,skim),[]);
    assert.deepEqual(events.step(dt,base),[]);
  }
  const popped={...base,grounded:false,verticalSpeed:5,ollieCount:1};
  assert.deepEqual(events.step(dt,popped).map(e=>e.kind),['ollie']);
  for(let i=0;i<20;i++)assert.deepEqual(events.step(dt,popped),[]);
  events.step(dt,{...popped,grounded:true});
  assert.deepEqual(events.step(dt,{...popped,ollieCount:2}).map(e=>e.kind),['ollie']);
  // Rail pops use the same signal; falling off a rail does not.
  events.step(dt,{...base,ollieCount:2,grounded:false,grinding:true});
  assert.deepEqual(events.step(dt,{...popped,ollieCount:2}).map(e=>e.kind),['grindOff']);
  events.step(dt,{...base,ollieCount:2,grounded:false,grinding:true});
  assert.deepEqual(events.step(dt,{...popped,ollieCount:3}).map(e=>e.kind),['ollie','grindOff']);
  assert.deepEqual(events.step(dt,{...base,resetCount:2,ollieCount:0}),[]);
});

test('mix responds to speed and removes road sounds in air and on rails', () => {
  assert.equal(rideMix({ ...base, speed: 0 }).roll, 0);
  assert.equal(rideMix({ ...base, speed: 0 }).wind, 0);
  assert.ok(rideMix({ ...base, speed: 80 }).wind > rideMix(base).wind);
  assert.equal(rideMix({ ...base, grounded: false }).roll, 0);
  assert.equal(rideMix({ ...base, grinding: true }).roll, 0);
  assert.ok(rideMix({ ...base, grinding: true }).grind > 0);
  assert.ok(rideMix({ ...base, braking: true }).skid > 0);
});

test('all synthesized effects contain finite, bounded audio with faded endpoints', () => {
  for (const kind of ['push', 'ollie', 'land', 'grindOn', 'grindOff', 'trick', 'bail'] as RideSound[]) {
    const data = synthesizeEffect(kind, 48000);
    let peak = 0;
    for (const value of data) { assert.ok(Number.isFinite(value)); peak = Math.max(peak, Math.abs(value)); }
    if (kind === 'ollie' || kind === 'land') {
      let total = 0, tail = 0;
      for (let i=0; i<data.length; i++) { total += data[i]!**2; if (i>48000*0.05) tail += data[i]!**2; }
      assert.ok(tail/total < 0.005, `${kind} should end with a dry contact, not a sustained tail`);
    }
    assert.ok(peak > 0.03 && peak < 1); assert.ok(data[0] === 0); assert.ok(Math.abs(data[data.length - 1]!) < 0.001);
  }
});

class Param { value = 0; setTargetAtTime(value: number) { this.value = value; } }
class Node {
  gain = new Param(); frequency = new Param(); Q = new Param(); playbackRate = new Param();
  threshold = new Param(); knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param();
  buffer: unknown; loop = false; type = ''; onended: (() => void) | null = null; stopped = false;
  connect() {} disconnect() {} start() {} stop() { this.stopped = true; this.onended?.(); }
}
class FakeContext {
  state = 'suspended'; currentTime = 0; sampleRate = 48000; destination = new Node();
  gains: Node[] = []; sources: Node[] = [];
  createGain() { const node = new Node(); this.gains.push(node); return node; }
  createBufferSource() { const node = new Node(); this.sources.push(node); return node; }
  createBiquadFilter() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data, copyToChannel: (values: Float32Array) => data.set(values) };
  }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}
function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } as Storage;
}

test('audio initializes on start only, remembers controls, mutes, pauses, and frees sources', async () => {
  const context = new FakeContext(), storage = memoryStorage(); let creations = 0;
  const audio = createGameAudio({ storage, createContext: () => { creations++; return context as unknown as AudioContext; } });
  assert.equal(creations, 0);
  audio.setVolume(0.3); audio.setMuted(true);
  assert.deepEqual(readAudioPreferences(storage), { muted: true, volume: 0.3 });
  audio.setRunning(true); await Promise.resolve();
  assert.equal(creations, 1); assert.equal(context.sources.length, 4); assert.equal(context.gains[0]!.gain.value, 0);
  audio.step(dt, base); audio.step(dt, { ...base, grounded: false, verticalSpeed: 7, ollieCount: 1 });
  assert.equal(context.sources.length, 4, 'muted actions must not create queued effects');
  audio.setMuted(false); assert.equal(context.gains[0]!.gain.value, 0.3);
  audio.mix(base); assert.ok(context.gains[1]!.gain.value > 0);
  audio.reset(); audio.step(dt, base); audio.step(dt, { ...base, grounded: false, verticalSpeed: 7, ollieCount: 1 });
  assert.equal(context.sources.length, 5);
  audio.setRunning(false); assert.equal(context.gains[0]!.gain.value, 0);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(context.state, 'suspended'); assert.ok(context.sources[4]!.stopped);
  audio.setRunning(true); await Promise.resolve(); assert.equal(context.state, 'running');
  assert.equal(creations, 1, 'resume must reuse the existing graph');
  audio.dispose(); assert.equal(context.state, 'closed');
  assert.ok(context.sources.every(source => source.stopped));
});

test('blocked storage and unavailable audio leave the game usable', () => {
  assert.deepEqual(readAudioPreferences({ getItem() { throw new Error('blocked'); } }), { muted: false, volume: 0.55 });
  const audio = createGameAudio({ storage: memoryStorage(), createContext() { throw new Error('unavailable'); } });
  audio.setRunning(true); assert.equal(audio.available, false);
  assert.doesNotThrow(() => { audio.mix(base); audio.step(dt, base); audio.setMuted(true); audio.dispose(); });
});


test('sustained textures stay smooth, bounded, and continuous across loop boundaries', () => {
  for (const kind of ['roll', 'wind', 'grind', 'skid'] as RideTexture[]) {
    const data = synthesizeLoop(kind, 48000);
    let energy = 0, differenceEnergy = 0, maxStep = 0;
    for (let i = 0; i < data.length; i++) {
      assert.ok(Number.isFinite(data[i]) && Math.abs(data[i]!) <= 0.7);
      energy += data[i]! ** 2;
      if (i > 0) {
        const delta = data[i]! - data[i - 1]!;
        differenceEnergy += delta * delta; maxStep = Math.max(maxStep, Math.abs(delta));
      }
    }
    assert.ok(Math.sqrt(energy / data.length) > 0.03);
    // Broadband static has a ratio near 2; these textures concentrate energy at lower frequencies.
    assert.ok(differenceEnergy / energy < (kind === 'wind' ? 0.006 : 0.02), `${kind} became hissy`);
    assert.ok(Math.abs(data[0]! - data[data.length - 1]!) < maxStep * 1.05 + 1e-6, `${kind} has a loop click`);
  }
  assert.ok(rideMix({ ...base, speed: 100 }).wind <= 0.045);
});


test('airborne wind remains gently audible at low and high speeds', () => {
  const air = { ...base, grounded: false };
  assert.ok(rideMix({ ...air, speed: 0 }).wind >= 0.04);
  assert.ok(rideMix(air).wind > rideMix(base).wind);
  assert.equal(rideMix({ ...base, speed: 0 }).wind, 0);
  assert.ok(rideMix({ ...air, speed: 100 }).wind <= 0.12);
});
