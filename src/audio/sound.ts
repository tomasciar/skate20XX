import { readGameValue } from '../storage.ts';
import { synthesizeLoop } from './textures.ts';
import type { RideTexture } from './textures.ts';
import {speedFromMph} from '../units.ts';
import { createSoundEvents } from './events.ts';
import type { RideAudioState, SoundEvent, RideSound } from './events.ts';

export type AudioPreferences = { muted: boolean; volume: number };
const PREF_KEY = 'skate20XX-audio';
export function readAudioPreferences(storage?: Pick<Storage, 'getItem'>): AudioPreferences {
  try {
    const value = JSON.parse((storage && readGameValue(storage, PREF_KEY)) ?? '{}');
    return { muted: value?.muted === true, volume: Number.isFinite(value?.volume) ? Math.max(0, Math.min(1, value.volume)) : 0.55 };
  } catch { return { muted: false, volume: 0.55 }; }
}

/** Short, unpitched wood/truck contacts: a tight "chk", with a second truck on landing. */
function synthesizeDeckContact(kind: 'ollie' | 'land', sampleRate: number) {
  const duration = kind === 'ollie' ? 0.055 : 0.085;
  const samples = new Float32Array(Math.ceil(duration * sampleRate));
  const brightRate = 1 - Math.exp(-2 * Math.PI * 4800 / sampleRate);
  const bodyRate = 1 - Math.exp(-2 * Math.PI * 550 / sampleRate);
  let seed = kind === 'ollie' ? 719 : 2341, bright = 0, body = 0;
  const contact = (t: number, at: number, decay: number) => {
    const age = t-at;
    return age < 0 ? 0 : (1-Math.exp(-age/0.00035))*Math.exp(-age/decay);
  };
  for (let i=0; i<samples.length; i++) {
    seed = (Math.imul(seed,1664525)+1013904223)|0;
    const noise = (seed>>>0)/2147483648-1, t = i/sampleRate;
    bright += (noise-bright)*brightRate; body += (noise-body)*bodyRate;
    const snap = kind === 'ollie'
      ? contact(t,0,0.0038)*0.65 + contact(t,0.0065,0.0016)*0.13
      : contact(t,0,0.0055)*0.72 + contact(t,0.013,0.0042)*0.40 + contact(t,0.025,0.002)*0.09;
    const wood = contact(t,0,kind === 'ollie' ? 0.003 : 0.006)*(kind === 'ollie' ? 0.10 : 0.20);
    samples[i] = ((bright-body)*snap + body*wood)*Math.min(1,(duration-t)/0.008);
  }
  return samples;
}

/** Deterministic synthesis keeps effects local and avoids audio downloads on startup. */
export function synthesizeEffect(kind: RideSound, sampleRate: number) {
  if (kind === 'ollie' || kind === 'land') return synthesizeDeckContact(kind,sampleRate);
  const duration = { push: 0.22, grindOn: 0.16, grindOff: 0.12, trick: 0.24, bail: 0.48 }[kind];
  const samples = new Float32Array(Math.ceil(duration * sampleRate));
  let seed = 1977, smooth = 0;
  const smoothing = 1 - Math.exp(-2 * Math.PI * 650 / sampleRate);
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    const noise = ((seed >>> 0) / 4294967296) * 2 - 1;
    smooth += (noise - smooth) * smoothing;
    const t = i / sampleRate, u = t / duration;
    const attack = Math.min(1, t / 0.003);
    const end = Math.min(1, (duration - t) / 0.015);
    let value = 0;
    // Short resonant wood/metal transients carry the identity; texture stays underneath.
    if (kind === 'push') value = (smooth * 0.20 + Math.sin(2 * Math.PI * 94 * t) * 0.12) * Math.sin(Math.PI * u);
    if (kind === 'grindOn' || kind === 'grindOff') value = (smooth * 0.07 + Math.sin(2 * Math.PI * 1250 * t) * 0.24
      + Math.sin(2 * Math.PI * 1873 * t) * 0.12) * Math.exp(-u * 7);
    if (kind === 'trick') value = smooth * Math.sin(Math.PI * u) * 0.30;
    if (kind === 'bail') value = (smooth * 0.15 + Math.sin(2 * Math.PI * 54 * t) * 0.38
      + Math.sin(2 * Math.PI * 310 * t) * 0.12) * Math.exp(-u * 5);
    samples[i] = value * attack * end;
  }
  return samples;
}

export function rideMix(state: RideAudioState) {
  // This only bounds audio gain; riding speed itself has no ceiling.
  const fullMixSpeed=speedFromMph(199);
  const speed = Math.max(0, Math.min(1, state.speed / fullMixSpeed));
  return {
    roll: state.grounded && !state.grinding && state.speed > 0.4 ? 0.04 + Math.sqrt(speed) * 0.14 : 0,
    wind: !state.grounded && !state.grinding ? 0.045 + Math.sqrt(speed) * 0.075 : Math.sqrt(speed) * 0.045,
    grind: state.grinding ? 0.12 + speed * 0.10 : 0,
    skid: state.grounded && !state.grinding && state.speed > 2 ? Math.sqrt(speed) * ((state.braking ? 0.10 : 0) + Math.min(1, Math.abs(state.steer)) * 0.02) : 0,
    speed,
  };
}

type Loop = { source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode };
export function createGameAudio(options: { createContext?: () => AudioContext; storage?: Storage } = {}) {
  let storage = options.storage;
  if (!storage) { try { storage = window.localStorage; } catch { /* Private browsing can deny storage. */ } }
  const preferences = readAudioPreferences(storage);
  const events = createSoundEvents();
  let context: AudioContext | null = null, master: GainNode | null = null;
  let running = false, unavailable = false;
  let suspendTimer: ReturnType<typeof setTimeout> | undefined;
  let loops: Loop[] = [];
  const effects = new Map<RideSound, AudioBuffer>();
  const voices = new Set<AudioBufferSourceNode>();
  const voiceGains = new Map<AudioBufferSourceNode, GainNode>();
  function fade(param: AudioParam, value: number, time = 0.04) {
    if (context) param.setTargetAtTime(value, context.currentTime, time);
  }
  function applyVolume() { if (master) fade(master.gain, running && !preferences.muted ? preferences.volume : 0, 0.02); }
  function save() { try { storage?.setItem(PREF_KEY, JSON.stringify(preferences)); } catch { /* Audio still works without persistence. */ } }
  function initialize() {
    if (context || unavailable) return;
    try {
      context = options.createContext ? options.createContext() : new AudioContext({ latencyHint: 'interactive' });
      master = context.createGain(); master.gain.value = 0;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -10; limiter.knee.value = 12; limiter.ratio.value = 3;
      limiter.attack.value = 0.003; limiter.release.value = 0.12;
      const lowCut = context.createBiquadFilter(), highCut = context.createBiquadFilter();
      lowCut.type = 'highpass'; lowCut.frequency.value = 30; lowCut.Q.value = 0.7;
      highCut.type = 'lowpass'; highCut.frequency.value = 3400; highCut.Q.value = 0.7;
      master.connect(lowCut); lowCut.connect(highCut); highCut.connect(limiter); limiter.connect(context.destination);
      loops = (['roll', 'wind', 'grind', 'skid'] as RideTexture[]).map((kind, i) => {
        const source = context!.createBufferSource(), filter = context!.createBiquadFilter(), gain = context!.createGain();
        const data = synthesizeLoop(kind, context!.sampleRate);
        const buffer = context!.createBuffer(1, data.length, context!.sampleRate);
        buffer.copyToChannel(data, 0);
        source.buffer = buffer; source.loop = true; filter.type = 'lowpass';
        filter.frequency.value = [850, 450, 2200, 1500][i]!; filter.Q.value = 0.55;
        gain.gain.value = 0; source.connect(filter); filter.connect(gain); gain.connect(master!);
        source.start(0, i * 0.37); return { source, filter, gain };
      });
    } catch {
      unavailable = true;
      if (context) void context.close().catch(() => {});
      context = null; master = null; loops = [];
    }
  }
  function play(event: SoundEvent) {
    if (!context || !master || !running || preferences.muted || context.state !== 'running' || voices.size >= 12) return;
    let buffer = effects.get(event.kind);
    if (!buffer) {
      const data = synthesizeEffect(event.kind, context.sampleRate);
      buffer = context.createBuffer(1, data.length, context.sampleRate); buffer.copyToChannel(data, 0); effects.set(event.kind, buffer);
    }
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer; gain.gain.value = event.strength * 0.85;
    source.connect(gain); gain.connect(master); voices.add(source); voiceGains.set(source, gain);
    source.onended = () => { source.disconnect(); gain.disconnect(); voices.delete(source); voiceGains.delete(source); };
    source.start();
  }
  function stopVoices() {
    for (const voice of voices) {
      voice.onended = null; voice.stop(); voice.disconnect(); voiceGains.get(voice)?.disconnect();
    }
    voices.clear(); voiceGains.clear();
  }
  function setRunning(value: boolean) {
    running = value; clearTimeout(suspendTimer);
    if (running) {
      // Called synchronously from click/Enter, which unlocks browser audio.
      initialize();
      if (context && context.state !== 'closed') {
        const activeContext = context;
        void activeContext.resume().then(() => {
          if (!running && activeContext.state === 'running') return activeContext.suspend();
        }).catch(() => {});
      }
    } else {
      events.reset();
      suspendTimer = setTimeout(() => {
        stopVoices();
        if (context?.state === 'running') void context.suspend().catch(() => {});
      }, 80);
    }
    applyVolume();
  }
  function step(dt: number, state: RideAudioState) { for (const event of events.step(dt, state)) play(event); }
  function mix(state: RideAudioState) {
    if (!context || loops.length !== 4) return;
    const levels = rideMix(state);
    [levels.roll, levels.wind, levels.grind, levels.skid].forEach((level, i) => fade(loops[i]!.gain.gain, level));
    const rates = [0.8 + levels.speed * 0.8, 1, 0.9 + levels.speed * 0.25, 0.9 + levels.speed * 0.2];
    loops.forEach((loop, i) => fade(loop.source.playbackRate, rates[i]!, 0.15));
    fade(loops[0]!.filter.frequency, 650 + levels.speed * 400, 0.15);
    fade(loops[1]!.filter.frequency, (state.grounded || state.grinding ? 400 : 650) + levels.speed * 200, 0.15);
  }
  function reset() { events.reset(); stopVoices(); for (const loop of loops) fade(loop.gain.gain, 0, 0.01); }
  function dispose() {
    clearTimeout(suspendTimer); stopVoices();
    for (const loop of loops) { loop.source.stop(); loop.source.disconnect(); loop.filter.disconnect(); loop.gain.disconnect(); }
    loops = []; effects.clear(); if (context) void context.close().catch(() => {});
    context = null; master = null;
  }
  return {
    preferences,
    get available() { return !unavailable; },
    setRunning, step, mix, reset, dispose,
    setMuted(muted: boolean) { preferences.muted = muted; save(); applyVolume(); },
    setVolume(volume: number) { if (Number.isFinite(volume)) { preferences.volume = Math.max(0, Math.min(1, volume)); save(); applyVolume(); } },
  };
}
