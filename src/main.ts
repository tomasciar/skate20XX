import "./style.css";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { basePixelRatio, createRenderQuality } from "./renderQuality";
import { createInput } from "./input";
import { createRamp } from "./world/ramp";
import { createBoardPlayer } from "./player/board";
import { createController } from "./player/controller";
import { createTrickSystem } from "./player/tricks";
import { screenGrabFacing } from "./player/grabs";
import { createChaseCamera } from "./camera/chase";
import { createGameAudio } from "./audio/sound";
import type { RideAudioState } from "./audio/events";
import { createHud } from "./ui/hud";
import { LANDING_SPEED } from "./player/speed";
import { createSky } from "./render/sky";
import { createSunRig, applySkyEnvironment } from "./render/lighting";
import { createParticles, SPARK, DUST, SNOW } from "./render/particles";
import {loadRideMode} from './mode';
import {createModeControls} from './ui/modes';
import {createHudOptions} from './ui/hudOptions';
import {loadCharacter} from './characters';
import {createCharacterControls} from './ui/characters';
import {createScore} from './player/score';
import {loadHighScore,saveHighScore} from './highScore';

async function main() {
  await RAPIER.init();

  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const hud = createHud();
  let mode=loadRideMode();hud.setMode(mode);
  const input = createInput();
  const controller = createController();
  const tricks = createTrickSystem();
  const audio = createGameAudio();
  const muteButton = document.getElementById("audio-mute") as HTMLButtonElement;
  const volumeControl = document.getElementById("audio-volume") as HTMLInputElement;
  function syncAudioControls() {
    muteButton.textContent = !audio.available ? "Audio unavailable" : audio.preferences.muted ? "Sound off · M" : "Sound on · M";
    muteButton.setAttribute("aria-pressed", String(audio.preferences.muted));
    muteButton.setAttribute("aria-label", audio.preferences.muted ? "Unmute sound (M)" : "Mute sound (M)");
    muteButton.disabled = volumeControl.disabled = !audio.available;
    volumeControl.value = String(Math.round(audio.preferences.volume * 100));
  }
  function toggleMute() { audio.setMuted(!audio.preferences.muted); syncAudioControls(); }
  muteButton.addEventListener("click", toggleMute);
  volumeControl.addEventListener("input", () => { audio.setVolume(Number(volumeControl.value) / 100); });
  syncAudioControls();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const quality = createRenderQuality();
  function applyRenderSize() {
    renderer.setPixelRatio(basePixelRatio(window.innerWidth, window.innerHeight, window.devicePixelRatio) * quality.scale);
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  applyRenderSize();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 420);

  const world = new RAPIER.World({ x: 0, y: -18, z: 0 });
  const fixedDt = 1 / 120;
  world.timestep = fixedDt;

  const ramp = createRamp(scene, world,{mode});
  const chase = createChaseCamera(camera, ramp.forward);
  const character=loadCharacter();
  const player = createBoardPlayer(scene, world, ramp,mode,character);
  const courseDirection=ramp.forward.clone();

  const sun = scene.getObjectByName("sun") as THREE.DirectionalLight;
  const sunRig = createSunRig(sun, scene);
  const sky = createSky((scene.fog as THREE.Fog).color, sunRig.direction);
  sky.setMode(mode,(scene.fog as THREE.Fog).color);
  scene.add(sky.mesh);
  applySkyEnvironment(renderer, scene, sky.mesh);
  const particles = createParticles();
  scene.add(particles.points);

  // Let the suspension settle on the launch platform before the first frame.
  const idle = {
    grabModifier: false, grabDX: 0, grabDY: 0,
    push: 0,
    steer: 0,
    crouch: false,
    crouchHold: 0,
    wantOllie: false,
    olliePower: 0,
    reset: false,
    flickDX: 0,
    flickDY: 0,
    flickReady: false,
  };
  for (let i = 0; i < 90; i++) {
    player.update(fixedDt, idle, tricks.state);
    world.step();
    player.sync();
  }
  chase.snap(player.position,ramp.directionAt?.(player.position,courseDirection));
  sunRig.update(player.position);

  let running = false;
  let last = performance.now();
  let acc = 0;
  let lastSteer = 0;
  let audioResetCount = player.resetCount;
  let pausedSceneDirty = true;
  let hudElapsed = 0;
  createHudOptions();
  createCharacterControls(character,next=>{input.clear();controller.reset();player.setCharacter(next);pausedSceneDirty=true;});
  // Scoring: one run per spawn, and a best per ride mode that is kept in memory in case storage is blocked.
  const score=createScore(),bests={skate:loadHighScore('skate'),snowboard:loadHighScore('snowboard')};
  let toBeat=bests[mode],scoreResetCount=player.resetCount;
  function showScore() { hud.setScore(score.total,Math.max(bests[mode],score.total),toBeat>0 && score.total>toBeat); }
  // Called wherever a run can end or the page can go away, so a best is never lost with the tab.
  function commitScore() { if(score.total>bests[mode])bests[mode]=saveHighScore(mode,score.total); }
  function newScoreRun() { commitScore();score.reset();toBeat=bests[mode]; }
  showScore();
  createModeControls(mode,next=>{
    newScoreRun();
    mode=next;ramp.setMode!(mode);player.setMode(mode);hud.setMode(mode);
    sky.setMode(mode,(scene.fog as THREE.Fog).color);applySkyEnvironment(renderer,scene,sky.mesh);
    particles.clear();pausedSceneDirty=true;
    toBeat=bests[mode];showScore();
  });
  const alongCourse = new THREE.Vector3();
  // Sparks and dust follow what the board is doing; rates are per second so they look the same at any refresh rate.
  const effect = { owed: 0, wasAirborne: false, fallSpeed: 0, at: new THREE.Vector3(), behind: new THREE.Vector3(), motion: new THREE.Vector3() };
  function emitEffects(dt: number) {
    const spray=mode==='snowboard'?SNOW:DUST;
    const airborne = !player.grounded && !player.grind.active;
    if (player.crashed) { effect.wasAirborne = false; effect.owed = 0; return; }
    const vertical = player.velocity.dot(ramp.surfaceNormal);
    effect.at.copy(player.renderPosition).addScaledVector(ramp.surfaceNormal, -0.06);
    if (effect.wasAirborne && player.grounded && effect.fallSpeed <= -LANDING_SPEED) {
      // Touchdown: a ring of dust sized by how hard the wheels came down.
      const puffs = Math.round(THREE.MathUtils.clamp(-effect.fallSpeed * 1.6, 4, 20));
      for (let i = 0; i < puffs; i++) {
        const angle = Math.random() * Math.PI * 2;
        effect.motion.copy(player.velocity).multiplyScalar(0.3).addScaledVector(ramp.surfaceNormal, 0.5 + Math.random());
        effect.motion.x += Math.cos(angle) * 2.2; effect.motion.z += Math.sin(angle) * 2.2;
        particles.emit(spray, effect.at, effect.motion, 0.6);
      }
    }
    if (airborne) effect.fallSpeed = vertical;
    effect.wasAirborne = airborne;
    const grinding = player.grind.active && player.speed > 2;
    const braking = player.grounded && player.slide.active && player.slide.amount > 0.12 && player.speed > 3;
    const carving = player.grounded && lastSteer !== 0 && player.speed > 16;
    const rate = grinding ? 110 : braking ? 70 : carving ? 40 : 0;
    if (!rate) { effect.owed = 0; return; }
    // Dust is kicked up by the trailing wheels, so it starts just past the tail in the direction of travel.
    effect.behind.copy(effect.at).addScaledVector(player.velocity, -0.9 / Math.max(player.speed, 0.001));
    for (effect.owed += rate * dt; effect.owed >= 1; effect.owed--) {
      if (grinding) {
        effect.motion.copy(player.velocity).multiplyScalar(0.45 + Math.random() * 0.3).addScaledVector(ramp.surfaceNormal, 0.8 + Math.random() * 2.2);
        particles.emit(SPARK, effect.at, effect.motion, 3.2);
      } else {
        effect.motion.copy(player.velocity).multiplyScalar(braking ? 0.3 : 0.5).addScaledVector(ramp.surfaceNormal, 0.4);
        particles.emit(spray, effect.behind, effect.motion, 1.1, braking ? 1 : 0.8);
      }
    }
  }
  function prepareCourse() {
    // Nibble upcoming chunks every frame so scroll never has to build on the camera frame.
    ramp.prepareNextChunk(4);
  }
  function audioState(): RideAudioState {
    return {
      speed: player.speed, grounded: player.grounded, grinding: player.grind.active,
      verticalSpeed: player.velocity.dot(ramp.surfaceNormal), braking: player.slide.active && player.slide.amount > 0.12, steer: lastSteer,
      pumpPhase: player.pump.phase, pumpStarts: player.pump.starts,
      trick: tricks.state.active ? `${tricks.state.active.id}:${tricks.state.started}` : null, bail: player.crashed || tricks.state.bail, resetCount: player.resetCount,
      ollieCount: player.ollieCount,
    };
  }

  function startSession() {
    input.clear();
    controller.reset();
    acc = 0;
    quality.reset();
    last = performance.now();
    running = true;
    audio.setRunning(true);
    syncAudioControls();
    hud.hideOverlay();
  }

  hud.overlay.addEventListener("click", startSession);
  canvas.addEventListener("click", () => {
    if (!running) startSession();
  });

  function pause() {
    running = false; acc = 0; pausedSceneDirty = true;
    lastSteer = 0;
    audio.setRunning(false);
    commitScore();showScore();
    input.clear(); controller.reset(); hud.showOverlay();
  }
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if(e.target instanceof HTMLElement && e.target.closest('select, textarea'))return;
    if (e.code === "KeyM") { e.preventDefault(); toggleMute(); }
    if (e.code === "Escape") { if (running) pause(); else startSession(); }
    if (e.code === "Enter" && !running && !(e.target instanceof HTMLElement && e.target.closest('button, input'))) startSession();
  });
  window.addEventListener("blur", pause);
  window.addEventListener("pagehide", pause);
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    applyRenderSize();
    pausedSceneDirty = true;
  });

  function frame(now: number) {
    requestAnimationFrame(frame);
    const frameDt = (now - last) / 1000;
    const raw = Math.min(0.05, frameDt);
    last = now;

    input.beginFrame();

    if (!running) {
      if (pausedSceneDirty) { renderer.render(scene, camera); pausedSceneDirty = false; }
      return;
    }

    acc += raw;
    while (acc >= fixedDt) {
      const intent = controller.update(input.state, fixedDt, !player.grounded && !player.grind.active && !player.crashed,
        player.canOllie || player.grind.active);
      lastSteer = player.aerial.active ? 0 : intent.steer;

      const grabFacing=screenGrabFacing(player.forward,ramp.directionAt?.(player.position,courseDirection) ?? ramp.forward,ramp.surfaceNormal);
      tricks.setGround(intent.groundDX ?? 0,intent.groundDY ?? 0,player.grounded && !player.grind.active && !player.crashed && !player.slide.active && !intent.wantSlide,
        grabFacing,intent.grabPress);
      tricks.setGrab(intent.grabDX, intent.grabDY, intent.grabModifier, !player.grounded && !player.grind.active && !player.crashed,
        grabFacing,intent.grabPress);
      if (intent.flickReady && !player.grounded && !player.grind.active && !player.crashed) {
        tricks.tryFlick(intent.flickDX, intent.flickDY, true);
      }
      tricks.holdFlick(intent.flickHoldDX ?? 0, intent.flickHoldDY ?? 0);

      if (intent.reset) { tricks.reset(); controller.reset(); }
      player.update(fixedDt, intent, tricks.state);
      input.consume();
      if (tricks.state.bail) tricks.clearBail();

      const landingGrade=tricks.state.landing ?? null;
      if (!player.crashed) tricks.update(fixedDt, player.grounded || player.grind.active, player.uprightDot, player.speed);

      world.step();
      player.sync(false);
      if (audioResetCount !== player.resetCount) { audio.reset(); controller.reset(); tricks.reset(); particles.clear(); effect.wasAirborne = false; audioResetCount = player.resetCount; }
      audio.step(fixedDt, audioState());
      if (scoreResetCount !== player.resetCount) { newScoreRun(); scoreResetCount = player.resetCount; }
      score.step(tricks.state,{
        distance:ramp.distance + Math.max(0, alongCourse.copy(player.position).sub(ramp.anchor).dot(ramp.forward)),
        grounded:player.grounded,crashed:player.crashed,landing:landingGrade,grind:player.grind,pitch:player.aerial.pitch,roll:player.aerial.roll,
      });
      chase.shift(player.originShift);
      particles.shift(player.originShift);
      if (intent.reset) chase.snap(player.position,ramp.directionAt?.(player.position,courseDirection));
      acc -= fixedDt;
    }

    if (alongCourse.copy(player.position).sub(ramp.anchor).dot(ramp.surfaceNormal) < -55 && !player.crashed) {
      player.reset(ramp.spawn);
      audio.reset(); audioResetCount = player.resetCount;
      particles.clear(); effect.wasAirborne = false;
      chase.snap(player.position,ramp.directionAt?.(player.position,courseDirection));
    }

    player.render(acc / fixedDt, raw);
    audio.mix(audioState());
    chase.update(raw, player.renderPosition,ramp.directionAt?.(player.renderPosition,courseDirection,20));
    sunRig.update(player.renderPosition);
    sky.update(raw);
    emitEffects(raw);
    particles.update(raw, renderer.domElement.height, camera.fov);
    hudElapsed += raw;
    if (hudElapsed >= 0.1) {
      hud.update(player.speed, tricks.state, ramp.distance + Math.max(0, alongCourse.copy(player.position).sub(ramp.anchor).dot(ramp.forward)), player.grind, player.aerial);
      showScore();
      hudElapsed = 0;
    }
    if (quality.update(frameDt)) applyRenderSize();
    renderer.render(scene, camera);
    prepareCourse();
  }

  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error(err);
  const overlay = document.getElementById("overlay");
  if (overlay) {
    overlay.textContent = `Unable to start SKATE5: ${String(err)}`;
  }
});
