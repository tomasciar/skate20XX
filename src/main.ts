import "./style.css";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { createInput } from "./input";
import { createRamp } from "./world/ramp";
import { createBoardPlayer } from "./player/board";
import { createController } from "./player/controller";
import { createTrickSystem } from "./player/tricks";
import { createChaseCamera } from "./camera/chase";
import { createHud } from "./ui/hud";

async function main() {
  await RAPIER.init();

  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const hud = createHud();
  const input = createInput();
  const controller = createController();
  const tricks = createTrickSystem();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
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

  const ramp = createRamp(scene, world);
  const chase = createChaseCamera(camera, ramp.forward);
  const player = createBoardPlayer(scene, world, ramp);

  // Let the suspension settle on the asphalt before the first frame
  const idle = {
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
  chase.snap(player.position);

  let running = false;
  let last = performance.now();
  let acc = 0;

  function startSession() {
    input.clear();
    controller.reset();
    acc = 0;
    last = performance.now();
    running = true;
    hud.hideOverlay();
  }

  hud.overlay.addEventListener("click", startSession);
  canvas.addEventListener("click", () => {
    if (!running) startSession();
  });

  function pause() {
    running = false; acc = 0;
    input.clear(); controller.reset(); hud.showOverlay();
  }
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "Escape") { if (running) pause(); else startSession(); }
    if (e.code === "Enter" && !running) startSession();
  });
  window.addEventListener("blur", pause);
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function frame(now: number) {
    requestAnimationFrame(frame);
    const raw = Math.min(0.05, (now - last) / 1000);
    last = now;

    input.beginFrame();

    if (!running) {
      renderer.render(scene, camera);
      return;
    }

    acc += raw;
    while (acc >= fixedDt) {
      const intent = controller.update(input.state, fixedDt);

      if (intent.flickReady && !player.grounded && !player.grind.active) {
        tricks.tryFlick(intent.flickDX, intent.flickDY, true);
      }

      if (intent.reset) { tricks.reset(); controller.reset(); }
      player.update(fixedDt, intent, tricks.state);
      input.consume();
      if (tricks.state.bail) tricks.clearBail();

      tricks.update(fixedDt, player.grounded || player.grind.active, player.uprightDot, player.speed);

      world.step();
      player.sync();
      chase.shift(player.originShift);
      if (intent.reset) chase.snap(player.position);
      acc -= fixedDt;
    }

    if (player.position.y < -6) {
      player.reset(ramp.spawn);
      chase.snap(player.position);
    }

    chase.update(raw, player.position);
    hud.update(player.speed, tricks.state, ramp.distance + Math.max(0, player.position.clone().sub(ramp.anchor).dot(ramp.forward)), player.grind);
    renderer.render(scene, camera);
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
