import * as THREE from "three";
import { BOARD, FOOT_Y } from "./dimensions.ts";
import type { PumpState } from "./pump.ts";
import { createRiderMotion, solveArm, solveLimb } from "./pose.ts";

export type SkaterVisual = {
  root: THREE.Group;
  board: THREE.Group;
  wheels: THREE.Object3D[];
  resetPose: () => void;
  setPose: (opts: {
    pump?: PumpState;
    dt: number;
    speed: number;
    push: number;
    verticalSpeed: number;
    grinding: boolean;
    crouch: number;
    lean: number;
    airborne: boolean;
    bail: boolean;
    wheelRoll: number;
    boardSpin: { x: number; y: number; z: number };
  }) => void;
};

export function createSkaterVisual(): SkaterVisual {
  const root = new THREE.Group(), board = new THREE.Group(), rider = new THREE.Group();
  root.add(board, rider);
  const mat = (color: number, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const grip = mat(0x222a2b), maple = mat(0xd1aa72), orange = mat(0xf27543);
  const steel = mat(0xaab9bf, 0.3, 0.8), rubber = mat(0xe8dfc6);
  const skin = mat(0xc48a65), shirt = mat(0x267a79), pants = mat(0x293b4a);
  const shoes = mat(0x253035), sole = mat(0xece1c7), helmet = mat(0xef7846, 0.35);
  function mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
  }
  function box(parent: THREE.Object3D, size: number[], material: THREE.Material, x = 0, y = 0, z = 0) {
    return mesh(parent, new THREE.BoxGeometry(size[0], size[1], size[2]), material, x, y, z);
  }
  // Rounded maple deck with a separate grip surface and lifted nose/tail.
  const outline = new THREE.Shape();
  outline.moveTo(-0.105, -0.28); outline.lineTo(-0.105, 0.28);
  outline.bezierCurveTo(-0.105, 0.44, 0.105, 0.44, 0.105, 0.28);
  outline.lineTo(0.105, -0.28); outline.bezierCurveTo(0.105, -0.44, -0.105, -0.44, -0.105, -0.28);
  const deckGeo = new THREE.ExtrudeGeometry(outline, { depth: 0.018, bevelEnabled: false, curveSegments: 10 });
  deckGeo.rotateX(-Math.PI / 2); deckGeo.translate(0, -0.009, 0);
  const positions = deckGeo.getAttribute('position');
  for (let i = 0; i < positions.count; i++) positions.setY(i, positions.getY(i) + Math.max(0, Math.abs(positions.getZ(i)) - 0.27) * 0.3);
  deckGeo.computeVertexNormals(); mesh(board, deckGeo, maple);
  const gripGeo = new THREE.ShapeGeometry(outline, 10); gripGeo.rotateX(-Math.PI / 2);
  const gp = gripGeo.getAttribute('position');
  for (let i = 0; i < gp.count; i++) gp.setY(i, 0.011 + Math.max(0, Math.abs(gp.getZ(i)) - 0.27) * 0.3);
  gripGeo.computeVertexNormals(); mesh(board, gripGeo, grip);
  box(board, [0.13, 0.004, 0.38], orange, 0, -0.021, 0);
  const wheels: THREE.Object3D[] = [];
  for (const z of [-BOARD.truckZ, BOARD.truckZ]) {
    box(board, [0.08, 0.014, 0.08], steel, 0, -0.025, z);
    box(board, [0.19, 0.025, 0.035], steel, 0, BOARD.hangerY, z);
    for (const x of [-BOARD.wheelX, BOARD.wheelX]) {
      for (const dz of [-0.025, 0.025]) mesh(board, new THREE.SphereGeometry(0.006, 6, 4), steel, x * 0.6, 0.016, z + dz);
      const spin = new THREE.Group(); spin.position.set(x, BOARD.wheelY, z); board.add(spin);
      mesh(spin, new THREE.CylinderGeometry(BOARD.wheelRadius, BOARD.wheelRadius, 0.032, 24), rubber).rotation.z = Math.PI / 2;
      mesh(spin, new THREE.CylinderGeometry(0.012, 0.012, 0.034, 10), steel).rotation.z = Math.PI / 2;
      box(spin, [0.034, 0.009, 0.025], orange, 0, 0.027, 0);
      wheels.push(spin);
    }
  }
  rider.rotation.y = Math.PI / 2;
  const hips = new THREE.Group(); rider.add(hips);
  mesh(hips, new THREE.CapsuleGeometry(0.11, 0.1, 4, 10), pants).rotation.z = Math.PI / 2;
  const torso = new THREE.Group(); hips.add(torso);
  const chest = mesh(torso, new THREE.CylinderGeometry(0.16, 0.13, 0.36, 12), shirt, 0, 0.23, 0);
  chest.scale.z = 0.65;
  box(torso, [0.23, 0.025, 0.15], shirt, 0, 0.065, 0);
  box(torso, [0.085, 0.06, 0.008], sole, -0.065, 0.29, -0.105);
  mesh(torso, new THREE.CylinderGeometry(0.044, 0.05, 0.07, 10), skin, 0, 0.44, 0);
  const head = new THREE.Group(); head.position.y = 0.53; torso.add(head);
  const face = mesh(head, new THREE.SphereGeometry(0.095, 16, 12), skin); face.scale.set(0.87, 1.13, 0.95);
  mesh(head, new THREE.SphereGeometry(0.106, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), helmet, 0, 0.035, 0);
  box(head, [0.15, 0.014, 0.08], helmet, 0, 0.045, -0.085);
  const black = mat(0x202e32);
  for (const x of [-0.037, 0.037]) {
    box(head, [0.044, 0.027, 0.014], black, x, 0.008, -0.085);
    mesh(head, new THREE.SphereGeometry(0.018, 8, 6), skin, Math.sign(x) * 0.09, 0, 0);
  }
  box(head, [0.03, 0.008, 0.014], black, 0, 0.01, -0.09);
  mesh(head, new THREE.SphereGeometry(0.017, 8, 6), skin, 0, -0.019, -0.091);
  box(head, [0.052, 0.012, 0.012], black, 0, -0.075, -0.05);
  function arm(side: number) {
    const upper = mesh(torso, new THREE.CylinderGeometry(0.032, 0.041, 1, 10), skin);
    const sleeve = mesh(torso, new THREE.CylinderGeometry(0.048, 0.054, 1, 10), shirt);
    const fore = mesh(torso, new THREE.CylinderGeometry(0.025, 0.03, 1, 10), skin);
    const elbow = mesh(torso, new THREE.SphereGeometry(0.034, 10, 8), skin);
    const hand = mesh(torso, new THREE.CapsuleGeometry(0.032, 0.035, 4, 10), black);
    upper.name = `upper-arm-${side}`;
    fore.name = `forearm-${side}`;
    hand.name = `hand-${side}`;
    elbow.name = `elbow-${side}`;
    return { side, upper, sleeve, fore, elbow, hand };
  }
  const arms = [arm(-1), arm(1)];
  function leg(side: number) {
    const thigh = mesh(rider, new THREE.CylinderGeometry(0.067, 0.052, 1, 10), pants);
    const shin = mesh(rider, new THREE.CylinderGeometry(0.052, 0.038, 1, 10), pants);
    const knee = mesh(rider, new THREE.SphereGeometry(0.063, 10, 8), black);
    knee.name = `knee-${side}`;
    shin.name = `shin-${side}`;
    const foot = new THREE.Group(); foot.position.set(side * 0.255, FOOT_Y, 0); rider.add(foot);
    foot.name = `foot-${side}`;
    box(foot, [0.115, 0.027, 0.23], sole, 0, -0.005, -0.025);
    box(foot, [0.105, 0.055, 0.21], shoes, 0, 0.03, -0.02);
    for (let i = 0; i < 3; i++) box(foot, [0.07, 0.005, 0.008], sole, 0, 0.06, -0.015 - i * 0.025);
    return { side, thigh, shin, knee, foot };
  }
  const legs = [leg(-1), leg(1)];
  const axis = new THREE.Vector3(0, 1, 0);
  function segment(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
    m.position.copy(a).add(b).multiplyScalar(0.5);
    const direction = b.clone().sub(a); m.scale.y = direction.length();
    m.quaternion.setFromUnitVectors(axis, direction.normalize());
  }
  const motion = createRiderMotion();
  function setPose(opts: Parameters<SkaterVisual['setPose']>[0]) {
    const m = motion.update(opts.dt, opts.crouch, opts.lean, opts.airborne && !opts.grinding, opts.push, opts.verticalSpeed, opts.speed, opts.pump, opts.grinding);
    const c = THREE.MathUtils.clamp(m.crouch + m.air * 0.25 + m.kneeLoad, 0, 1);
    const rhythm = Math.sin(m.time * 5.2);
    const breathing = Math.sin(m.time * 2.4) * 0.003;
    const roadMotion = Math.sin(opts.wheelRoll * 0.025) * Math.min(opts.speed / 80, 1) * 0.003 * (1 - m.air);
    const pushSwing = Math.sin(m.pushPhase) * m.push;
    for (const w of wheels) w.rotation.x = opts.wheelRoll;
    // Wheel contacts stay fixed. Weight shifts belong to the rider, not a rolling wheel group.
    board.rotation.set(opts.boardSpin.x, opts.boardSpin.y, opts.boardSpin.z);
    const hipY = 0.73 - c * 0.22 - m.landing - m.push * (0.035 + Math.abs(m.lean) * 0.025) + breathing + roadMotion;
    hips.position.set(pushSwing * 0.012 + m.sway * 0.5, hipY, 0.025 + c * 0.1 - m.lean * 0.065 + m.sway);
    torso.rotation.set(-0.08 - c * 0.25 - m.brake * 0.1, -0.15 + pushSwing * 0.07 + m.sway * 2, m.lean * 0.13 - m.sway * 1.2);
    head.rotation.set(c * 0.1, -Math.PI / 2 + 0.25 - m.lean * 0.12, -m.lean * 0.08);
    for (const l of legs) {
      // Only the pushing foot leaves the grip; all other weight shifts preserve the stance.
      l.foot.position.set(l.side * 0.255, FOOT_Y, 0);
      if (l.side === 1) {
        const phase = m.pushPhase;
        const lift = Math.max(0, Math.sin(phase));
        const stroke = Math.max(0, -Math.sin(phase));
        l.foot.position.x += Math.cos(phase) * m.push * 0.09;
        l.foot.position.z += m.push * (0.16 + stroke * 0.07);
        l.foot.position.y += m.push * (lift * 0.06 - stroke * 0.10);
      }
      const hip = new THREE.Vector3(l.side * 0.095, 0, 0).add(hips.position);
      const ankle = l.foot.position.clone().add(new THREE.Vector3(0, 0.06, 0));
      // Both knees bend toward the chest's forward direction (-Z in rider space).
      const solved = solveLimb(hip, ankle, new THREE.Vector3(0, 0, -1), 0.38, 0.38);
      segment(l.thigh, hip, solved.joint); segment(l.shin, solved.joint, solved.end); l.knee.position.copy(solved.joint);
    }
    for (const a of arms) {
      const shoulder = new THREE.Vector3(a.side * 0.17, 0.36, 0);
      const spread = 0.27 + m.air * 0.13 + (opts.grinding ? 0.10 : 0);
      const hand = new THREE.Vector3(a.side * spread + m.lean * 0.04 - m.sway,
        0.03 + c * 0.14 + m.air * 0.12 + a.side * pushSwing * 0.035,
        -0.13 - c * 0.16 + a.side * pushSwing * 0.11 + rhythm * 0.009);
      const solved = solveArm(shoulder, hand, a.side);
      segment(a.upper, shoulder, solved.joint);
      segment(a.sleeve, shoulder, shoulder.clone().lerp(solved.joint, 0.55));
      segment(a.fore, solved.joint, solved.end);
      a.elbow.position.copy(solved.joint); a.hand.position.copy(solved.end);
      a.hand.quaternion.copy(a.fore.quaternion);
    }
    // Keep the feet in board space; leaning the whole skeleton used to lift one sole.
    rider.rotation.set(opts.bail ? 1.1 : 0, Math.PI / 2, opts.bail ? 0.8 : 0);
  }
  return { root, board, wheels, setPose, resetPose: motion.reset };
}
