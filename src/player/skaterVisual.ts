import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { BOARD, FOOT_Y, RIDER } from "./dimensions.ts";
import { CARVE } from "./carve.ts";
import type { RagdollRig, RagdollPart, RagdollJoint } from "./ragdoll.ts";
import { TUCK, grabTransform } from "./grabPose.ts";
import type { GrabDef } from "./grabs.ts";
import type { PumpState } from "./pump.ts";
import { createRiderMotion, solveArm, solveLimb } from "./pose.ts";
import { sampleTrickFoot } from "./trickFeet.ts";
import type { TrickFootPose } from "./trickFeet.ts";
import type { GroundTrick, TrickDef } from "./tricks.ts";
import {applyRideSkin} from '../mode.ts';
import type {RideMode} from '../mode.ts';
import {createSnowboardVisual,SNOWBOARD} from './snowboardVisual.ts';

const RIDING_GRAB = {...TUCK,offset:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},
  crouch:0.95,hipDrop:0.14,chestPitch:-0.4};

export type SkaterVisual = {
  root: THREE.Group;
  board: THREE.Group;
  /** Deck, grip and baseplates: rolls on the trucks while the wheels stay on the road. */
  deck: THREE.Group;
  wheels: THREE.Object3D[];
  setMode: (mode:RideMode)=>void;
  resetPose: () => void;
  captureRagdoll: () => RagdollRig;
  setRagdoll: (active: boolean) => void;
  setPose: (opts: {
    grab?: GrabDef | null;
    groundTrick?: GroundTrick | null;
    /** Signed load while skidding sideways along the road. */
    slide?: number;
    headForward?: THREE.Vector3;
    /** World rotation of a whole-body flip; the head keeps its course aim relative to it. */
    headFrame?: THREE.Quaternion;
    pump?: PumpState;
    trick?: TrickDef | null;
    trickTime?: number;
    dt: number;
    speed: number;
    push: number;
    verticalSpeed: number;
    grinding: boolean;
    crouch: number;
    lean: number;
    /** Signed carve load, -1..1: rolls the deck and puts the rider's weight over the inside edge. */
    carve?: number;
    airborne: boolean;
    bail: boolean;
    wheelRoll: number;
    boardSpin: { x: number; y: number; z: number };
  }) => void;
};

export function createSkaterVisual(initialMode:RideMode='skate'): SkaterVisual {
  const root = new THREE.Group(), board = new THREE.Group(), rider = new THREE.Group(), deck = new THREE.Group();
  root.add(board, rider); board.add(deck);
  const skateDeck=new THREE.Group(),skateGear=new THREE.Group();
  skateDeck.userData.rideSkin=skateGear.userData.rideSkin='skate';
  deck.add(skateDeck);board.add(skateGear);
  const mat = (color: number, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const grip = mat(0x222a2b), maple = mat(0xd1aa72), orange = mat(0xf27543);
  const steel = mat(0xaab9bf, 0.3, 0.8), rubber = mat(0xe8dfc6);
  const skin = mat(0xc48a65), shirt = mat(0x267a79), pants = mat(0x293b4a);
  const armSurface=mat(0xc48a65);
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
  deckGeo.computeVertexNormals(); mesh(skateDeck, deckGeo, maple);
  const gripGeo = new THREE.ShapeGeometry(outline, 10); gripGeo.rotateX(-Math.PI / 2);
  const gp = gripGeo.getAttribute('position');
  for (let i = 0; i < gp.count; i++) gp.setY(i, 0.011 + Math.max(0, Math.abs(gp.getZ(i)) - 0.27) * 0.3);
  gripGeo.computeVertexNormals(); mesh(skateDeck, gripGeo, grip);
  box(skateDeck, [0.13, 0.004, 0.38], orange, 0, -0.021, 0);
  const wheels: THREE.Object3D[] = [];
  for (const z of [-BOARD.truckZ, BOARD.truckZ]) {
    box(skateDeck, [0.08, 0.014, 0.08], steel, 0, -0.025, z);
    box(skateGear, [0.19, 0.025, 0.035], steel, 0, BOARD.hangerY, z);
    for (const x of [-BOARD.wheelX, BOARD.wheelX]) {
      for (const dz of [-0.025, 0.025]) mesh(skateDeck, new THREE.SphereGeometry(0.006, 6, 4), steel, x * 0.6, 0.016, z + dz);
      const spin = new THREE.Group(); spin.position.set(x, BOARD.wheelY, z); skateGear.add(spin);
      mesh(spin, new THREE.CylinderGeometry(BOARD.wheelRadius, BOARD.wheelRadius, 0.032, 24), rubber).rotation.z = Math.PI / 2;
      mesh(spin, new THREE.CylinderGeometry(0.012, 0.012, 0.034, 10), steel).rotation.z = Math.PI / 2;
      box(spin, [0.034, 0.009, 0.025], orange, 0, 0.027, 0);
      wheels.push(spin);
    }
  }
  batchStaticMeshes(skateDeck); batchStaticMeshes(skateGear);
  const snowboard=createSnowboardVisual();batchStaticMeshes(snowboard);deck.add(snowboard);
  rider.rotation.y = RIDER.stanceY;
  const hips = new THREE.Group(); rider.add(hips);
  const pelvis = mesh(hips, new THREE.CapsuleGeometry(0.11, 0.1, 4, 10), pants); pelvis.rotation.z = Math.PI / 2;
  const torso = new THREE.Group(); hips.add(torso);
  const chest = mesh(torso, new THREE.CylinderGeometry(0.16, 0.13, 0.36, 12), shirt, 0, 0.23, 0);
  chest.name = 'chest';
  chest.scale.z = 0.65;
  box(torso, [0.23, 0.025, 0.15], shirt, 0, 0.065, 0);
  box(torso, [0.085, 0.06, 0.008], sole, -0.065, 0.29, -0.105);
  mesh(torso, new THREE.CylinderGeometry(0.044, 0.05, 0.07, 10), skin, 0, 0.44, 0);
  const head = new THREE.Group(); head.position.y = 0.53; torso.add(head);
  head.name = 'head';
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
  batchStaticMeshes(head);
  const goggles=new THREE.Group();goggles.userData.rideSkin='snowboard';head.add(goggles);
  box(goggles,[0.16,0.048,0.032],black,0,0.012,-0.083);
  box(goggles,[0.135,0.031,0.008],mat(0x88cfe7,0.2,0.35),0,0.016,-0.103);
  for(const side of [-1,1])box(goggles,[0.014,0.029,0.14],black,side*0.088,0.016,-0.008);
  batchStaticMeshes(goggles);
  function arm(side: number) {
    const upper = mesh(torso, new THREE.CylinderGeometry(0.032, 0.041, 1, 10), armSurface);
    const sleeve = mesh(torso, new THREE.CylinderGeometry(0.048, 0.054, 1, 10), shirt);
    const fore = mesh(torso, new THREE.CylinderGeometry(0.025, 0.03, 1, 10), armSurface);
    const elbow = mesh(torso, new THREE.SphereGeometry(0.034, 10, 8), armSurface);
    const hand = mesh(torso, new THREE.CapsuleGeometry(0.032, 0.035, 4, 10), black);
    sleeve.name = `sleeve-${side}`;
    upper.name = `upper-arm-${side}`;
    fore.name = `forearm-${side}`;
    hand.name = `hand-${side}`;
    elbow.name = `elbow-${side}`;
    return { side, upper, sleeve, fore, elbow, hand };
  }
  const arms = [arm(-1), arm(1)];
  function leg(side: number) {
    const thigh = mesh(rider, new THREE.CylinderGeometry(0.072, 0.055, 1, 10), pants);
    const shin = mesh(rider, new THREE.CylinderGeometry(0.052, 0.038, 1, 10), pants);
    const knee = mesh(rider, new THREE.SphereGeometry(0.063, 10, 8), black);
    knee.name = `knee-${side}`;
    shin.name = `shin-${side}`;
    const foot = new THREE.Group(); foot.position.set(side * 0.255, FOOT_Y, 0); rider.add(foot);
    foot.name = `foot-${side}`;
    box(foot, [0.115, 0.027, 0.23], sole, 0, -0.005, -0.025);
    box(foot, [0.105, 0.055, 0.21], shoes, 0, 0.03, -0.02);
    for (let i = 0; i < 3; i++) box(foot, [0.07, 0.005, 0.008], sole, 0, 0.06, -0.015 - i * 0.025);
    batchStaticMeshes(foot);
    const boot=new THREE.Group();boot.userData.rideSkin='snowboard';foot.add(boot);
    box(boot,[0.111,0.1,0.125],shoes,0,0.10,0.012);
    box(boot,[0.115,0.013,0.13],orange,0,0.113,0.012);batchStaticMeshes(boot);
    const trickPose:TrickFootPose={x:0,y:0,z:0,pitch:0,yaw:0,roll:0};
    return { side, thigh, shin, knee, foot, trickPose };
  }
  const legs = [leg(-1), leg(1)];
  const axis = new THREE.Vector3(0, 1, 0);
  function segment(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
    m.position.copy(a).add(b).multiplyScalar(0.5);
    const direction = b.clone().sub(a); m.scale.y = direction.length();
    m.quaternion.setFromUnitVectors(axis, direction.normalize());
  }
  const motion = createRiderMotion();
  let grabBlend = 0, carve = 0, manual = 0;
  const carveTilt = new THREE.Quaternion(), riderX = new THREE.Vector3(1,0,0), gripPivot = new THREE.Vector3(0,BOARD.gripY,0);
  let heldGrab: GrabDef | null = null;
  let heldGroundGrab = false;
  const manualRotation=new THREE.Quaternion(),manualPivot=new THREE.Vector3(),manualOffset=new THREE.Vector3();
  const inverseStance=new THREE.Quaternion();
  const faceForward = new THREE.Vector3(0,0,-1), headAim = new THREE.Vector3();
  const headWorld = new THREE.Quaternion(), headParent = new THREE.Quaternion();
  const rearGrabHead=new THREE.Quaternion(),rearHeadAngles=new THREE.Euler(0,0,0,'YXZ');
  let rearHeadHeld=false;
  const kickRotation=new THREE.Quaternion(),kickEuler=new THREE.Euler();
  let mode=initialMode;
  function setMode(next:RideMode) {
    mode=next;applyRideSkin(root,mode);
    const snow=mode==='snowboard';
    shirt.color.setHex(snow?0xe35e42:0x267a79);armSurface.color.setHex(snow?0xe35e42:0xc48a65);
    pants.color.setHex(snow?0x233c56:0x293b4a);helmet.color.setHex(snow?0x315e82:0xef7846);
  }
  setMode(initialMode);
  function setPose(opts: Parameters<SkaterVisual['setPose']>[0]) {
    const slide=opts.airborne || opts.grinding || opts.bail ? 0 : THREE.MathUtils.clamp(opts.slide ?? 0,-1,1);
    const m = motion.update(opts.dt, opts.crouch, opts.lean, opts.airborne && !opts.grinding, opts.push, opts.verticalSpeed, opts.speed, opts.pump, opts.grinding);
    const riding = !opts.airborne && !opts.grinding && !opts.bail;
    const groundGrab = riding ? opts.groundTrick?.grab : null;
    const selectedGrab = groundGrab ?? (opts.airborne && !opts.grinding && !opts.bail ? opts.grab : null);
    const footTrick=opts.airborne && !opts.grinding && !opts.bail && !selectedGrab ? opts.trick : null;
    const trickProgress=footTrick ? (opts.trickTime ?? 0)/footTrick.duration : 0;
    // Blend out before changing hands or grip targets, avoiding a hand snapping across the board.
    if (selectedGrab && (!heldGrab || heldGrab.id === selectedGrab.id || grabBlend < 0.02)) {
      heldGrab = selectedGrab;heldGroundGrab=!!groundGrab;
    }
    const grabbing = !!selectedGrab && heldGrab?.id === selectedGrab.id;
    grabBlend = THREE.MathUtils.damp(grabBlend, grabbing ? 1 : 0, 14, opts.dt);
    if ((heldGroundGrab ? !riding : !opts.airborne) || opts.grinding || opts.bail) grabBlend = 0;
    if (!selectedGrab && grabBlend < 0.002) { heldGrab = null; grabBlend = 0; }
    if (opts.boardSpin.x || opts.boardSpin.y || opts.boardSpin.z) { grabBlend = 0; heldGrab = null; }
    carve = THREE.MathUtils.damp(carve, opts.airborne || opts.grinding || opts.bail ? 0 : THREE.MathUtils.clamp(opts.carve ?? 0,-1,1), 10, opts.dt);
    if (Math.abs(carve) < 1e-5) carve = 0;
    manual = riding ? THREE.MathUtils.damp(manual,opts.groundTrick?.manual ?? 0,10,opts.dt) : 0;
    if (Math.abs(manual)<1e-5) manual=0;
    // Roll about the grip centerline: the soles stay planted and the wheels stay on the road.
    const tilt = carve ? -carve * CARVE.deckTilt : 0;
    deck.rotation.z = tilt;
    deck.position.copy(gripPivot).sub(gripPivot.clone().applyEuler(deck.rotation));
    const edgeLift=mode==='snowboard' ? Math.abs(Math.sin(tilt))*SNOWBOARD.halfWidth+(1-Math.cos(tilt))*(BOARD.gripY-SNOWBOARD.baseY) : 0;
    deck.position.y+=edgeLift;
    carveTilt.setFromAxisAngle(riderX, tilt);
    const tweak = heldGroundGrab ? RIDING_GRAB : heldGrab?.tweak ?? TUCK;
    const c = THREE.MathUtils.lerp(THREE.MathUtils.clamp(m.crouch+m.air*0.25+m.kneeLoad+Math.abs(manual)*0.25+Math.abs(slide)*0.5,0,1),tweak.crouch,grabBlend);
    const grabPose = grabTransform(tweak,grabBlend);
    const stance = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),RIDER.stanceY);
    board.position.copy(grabPose.offset).applyQuaternion(stance);
    const rhythm = Math.sin(m.time * 5.2);
    const breathing = Math.sin(m.time * 2.4) * 0.003;
    const roadMotion = Math.sin(opts.wheelRoll * 0.025) * Math.min(opts.speed / 80, 1) * 0.003 * (1 - m.air);
    const pushSwing = Math.sin(m.pushPhase) * m.push;
    for (const w of wheels) w.rotation.x = opts.wheelRoll;
    // Wheel contacts stay fixed. Weight shifts belong to the rider, not a rolling wheel group.
    board.rotation.set(opts.boardSpin.x, opts.boardSpin.y, opts.boardSpin.z);
    if (grabBlend > 0) board.quaternion.premultiply(stance.clone().multiply(grabPose.rotation).multiply(stance.clone().invert()));
    if (manual) {
      // Pitch around the supporting axle: its wheel centers and contact height stay fixed.
      manualRotation.setFromAxisAngle(riderX,manual*0.22);
      manualPivot.set(0,BOARD.wheelY,Math.sign(manual)*BOARD.truckZ);
      manualOffset.copy(manualPivot).sub(manualPivot.applyQuaternion(manualRotation));
      board.position.copy(manualOffset);board.quaternion.premultiply(manualRotation);
      inverseStance.copy(stance).invert();
      grabPose.offset.copy(manualOffset).applyQuaternion(inverseStance);
      grabPose.rotation.copy(inverseStance).multiply(manualRotation).multiply(stance);
    }
    const ridingGrabBlend=heldGroundGrab ? grabBlend : 0;
    const grabHand=heldGrab?.hand ?? 1;
    const hipY = RIDER.hipHeight - c * 0.22 - grabBlend * tweak.hipDrop - m.landing - m.push * (0.035 + Math.abs(m.lean) * 0.025) + breathing + roadMotion;
    hips.position.set(pushSwing * 0.012 + m.sway * 0.5 + tweak.hipX*grabBlend + manual*0.16 - grabHand*ridingGrabBlend*0.08,
      hipY - Math.abs(carve)*0.03, 0.025 + c * 0.1 - m.lean * 0.065*(1-grabBlend) - carve*0.09 + m.sway + slide*0.07);
    // Toeside carves fold the chest over the toes; heelside carves sit back over the heels.
    torso.rotation.set(THREE.MathUtils.lerp(-0.08-c*0.25-m.brake*0.1,tweak.chestPitch,grabBlend) - carve*(carve>0 ? 0.26 : 0.14) - slide*0.15,
      -0.15+pushSwing*0.07+m.sway*2, m.lean*0.13-m.sway*1.2+tweak.chestRoll*grabBlend - manual*0.12 - grabHand*ridingGrabBlend*0.95);
    for (const l of legs) {
      // Only the pushing foot leaves the grip; all other weight shifts preserve the stance.
      l.foot.position.set(0,FOOT_Y-BOARD.gripY,0).applyQuaternion(carveTilt);
      l.foot.position.x+=l.side*0.255; l.foot.position.y+=BOARD.gripY+edgeLift;
      l.foot.position.applyQuaternion(grabPose.rotation).add(grabPose.offset);
      l.foot.quaternion.copy(grabPose.rotation).multiply(carveTilt);
      if (l.side === 1) {
        const phase = m.pushPhase;
        const lift = Math.max(0, Math.sin(phase));
        const stroke = Math.max(0, -Math.sin(phase));
        l.foot.position.x += Math.cos(phase) * m.push * 0.09;
        l.foot.position.z += m.push * (0.16 + stroke * 0.07);
        l.foot.position.y += m.push * (lift * 0.06 - stroke * 0.10);
      }
      if(footTrick) {
        sampleTrickFoot(footTrick.id,trickProgress,l.side,l.trickPose);
        const kick=l.trickPose;
        l.foot.position.x+=kick.x;l.foot.position.y+=kick.y;l.foot.position.z+=kick.z;
        kickRotation.setFromEuler(kickEuler.set(kick.pitch,kick.yaw,kick.roll));
        l.foot.quaternion.multiply(kickRotation);
      }
      const hip = new THREE.Vector3(l.side * 0.095, 0, 0).add(hips.position);
      const ankle = l.foot.position.clone().add(new THREE.Vector3(0,0.06,0).applyQuaternion(l.foot.quaternion));
      // Rear tucks fold the knees down below the hips, rather than up through the waist.
      const pole=tweak.kneePole;
      const kneePole=pole ? new THREE.Vector3(pole.x*grabBlend,pole.y*grabBlend,THREE.MathUtils.lerp(-1,pole.z,grabBlend)) : new THREE.Vector3(0,0,-1);
      const solved = solveLimb(hip, ankle, kneePole, RIDER.upperLeg, RIDER.lowerLeg);
      segment(l.thigh, hip, solved.joint); segment(l.shin, solved.joint, solved.end); l.knee.position.copy(solved.joint);
    }
    for (const a of arms) {
      const shoulder = new THREE.Vector3(a.side * 0.17, 0.36, 0);
      const spread = 0.27 + m.air * 0.13 + (opts.grinding ? 0.10 : 0) + Math.abs(manual)*0.1 + Math.abs(slide)*0.1;
      const hand = new THREE.Vector3(a.side * spread + m.lean * 0.04 - m.sway,
        0.03 + c * 0.14 + m.air * 0.12 + a.side * pushSwing * 0.035,
        -0.13 - c * 0.16 + a.side * pushSwing * 0.11 + rhythm * 0.009);
      if (heldGrab && a.side === heldGrab.hand) {
        const grip = new THREE.Vector3(heldGrab.grip.x,heldGrab.grip.y,heldGrab.grip.z);
        if (heldGroundGrab) { grip.sub(gripPivot).applyQuaternion(carveTilt).add(gripPivot);grip.y+=edgeLift; }
        grip.applyQuaternion(grabPose.rotation).add(grabPose.offset);
        // Convert the fixed board grip into the leaning torso's coordinate system.
        grip.sub(hips.position).applyQuaternion(torso.quaternion.clone().invert());
        hand.lerp(grip, grabBlend);
      }
      // Reach around the outside of the tucked leg for the rear grab.
      const solved = heldGrab?.direction==='back' && a.side===heldGrab.hand
        ? solveLimb(shoulder,hand,new THREE.Vector3(a.side*THREE.MathUtils.lerp(0.25,1.5,grabBlend),-0.1,THREE.MathUtils.lerp(1,0.1,grabBlend)),0.25,0.24)
        : solveArm(shoulder, hand, a.side);
      segment(a.upper, shoulder, solved.joint);
      segment(a.sleeve, shoulder, shoulder.clone().lerp(solved.joint, 0.55));
      segment(a.fore, solved.joint, solved.end);
      a.elbow.position.copy(solved.joint); a.hand.position.copy(solved.end);
      a.hand.quaternion.copy(a.fore.quaternion);
    }
    // Keep the feet in board space; leaning the whole skeleton used to lift one sole.
    rider.rotation.set(opts.bail ? 1.1 : 0, RIDER.stanceY, opts.bail ? 0.8 : 0);
    // Keep the face aimed down the course while the torso carves, grabs or spins.
    headAim.copy(opts.headForward ?? faceForward).normalize();
    headWorld.setFromUnitVectors(faceForward,headAim);
    if(opts.headFrame)headWorld.premultiply(opts.headFrame);
    head.quaternion.copy(torso.getWorldQuaternion(headParent)).invert().multiply(headWorld);
    const rearGrab=heldGrab?.direction==='back' && grabBlend>0;
    if(rearGrab) {
      if(!rearHeadHeld) {
        // Hold a comfortable neck pose through the grab instead of twisting to keep a world-space gaze.
        rearHeadAngles.setFromQuaternion(head.quaternion,'YXZ');
        rearHeadAngles.x=THREE.MathUtils.clamp(rearHeadAngles.x,-0.35,0.35);
        rearHeadAngles.y=THREE.MathUtils.clamp(rearHeadAngles.y,-1.45,1.45);
        rearHeadAngles.z=THREE.MathUtils.clamp(rearHeadAngles.z,-0.15,0.15);
        rearGrabHead.setFromEuler(rearHeadAngles);
      }
      head.quaternion.slerp(rearGrabHead,grabBlend);
    }
    rearHeadHeld=rearGrab;
  }
  function captureRagdoll(): RagdollRig {
    root.updateMatrixWorld(true);
    const parts: RagdollPart[] = [], joints: RagdollJoint[] = [];
    const point = (object: THREE.Object3D, x = 0, y = 0, z = 0) => object.localToWorld(new THREE.Vector3(x,y,z));
    const part = (id: string, reference: THREE.Object3D, center: THREE.Vector3, objects: THREE.Object3D[], mass: number, shape: RagdollPart['shape']) => {
      parts.push({ id, center, rotation: reference.getWorldQuaternion(new THREE.Quaternion()), objects, mass, shape });
    };
    part('pelvis', pelvis, pelvis.getWorldPosition(new THREE.Vector3()), [pelvis], 12, { kind: 'capsule', length: 0.3, radius: 0.10 });
    const torsoObjects = torso.children.filter(o => o instanceof THREE.Mesh && (!o.name || o===chest));
    part('torso', torso, point(torso,0,0.23), torsoObjects, 24, { kind: 'box', half: new THREE.Vector3(0.15,0.18,0.09) });
    part('head', head, point(head), [head], 5, { kind: 'ball', radius: 0.115 });
    joints.push({ a: 'pelvis', b: 'torso', anchor: point(torso,0,0.08), kind: 'ball' },
      { a: 'torso', b: 'head', anchor: point(torso,0,0.44), kind: 'ball' });
    const hinge = (a: string, b: string, start: THREE.Vector3, middle: THREE.Vector3, end: THREE.Vector3) => {
      const upper = middle.clone().sub(start).normalize(), lower = end.clone().sub(middle).normalize();
      const axis = new THREE.Vector3().crossVectors(upper, lower).normalize();
      if (axis.lengthSq() < 0.1) axis.set(1,0,0).applyQuaternion(root.quaternion);
      joints.push({ a,b, anchor: middle, kind: 'hinge', axis, flex: Math.acos(THREE.MathUtils.clamp(upper.dot(lower),-1,1)) });
    };
    for (const a of arms) {
      const id = `arm${a.side}`, fore = `fore${a.side}`, handId = `hand${a.side}`;
      const shoulder = point(torso,a.side*0.17,0.36), elbow = point(a.elbow), wrist = point(a.hand);
      part(id, a.upper, a.upper.getWorldPosition(new THREE.Vector3()), [a.upper,a.sleeve], 2.5, { kind: 'capsule', length: 0.25, radius: 0.04 });
      part(fore, a.fore, a.fore.getWorldPosition(new THREE.Vector3()), [a.fore,a.elbow], 1.5, { kind: 'capsule', length: 0.24, radius: 0.03 });
      part(handId, a.hand, wrist, [a.hand], 0.5, { kind: 'ball', radius: 0.035 });
      joints.push({ a:'torso',b:id,anchor:shoulder,kind:'ball' }, { a:fore,b:handId,anchor:wrist,kind:'fixed' });
      hinge(id,fore,shoulder,elbow,wrist);
    }
    for (const l of legs) {
      const thigh = `thigh${l.side}`, shin = `shin${l.side}`, foot = `foot${l.side}`;
      const hip = point(hips,l.side*0.095), knee = point(l.knee), ankle = point(l.foot,0,0.06);
      part(thigh,l.thigh,l.thigh.getWorldPosition(new THREE.Vector3()),[l.thigh],7,{kind:'capsule',length:RIDER.upperLeg,radius:0.065});
      part(shin,l.shin,l.shin.getWorldPosition(new THREE.Vector3()),[l.shin,l.knee],4,{kind:'capsule',length:RIDER.lowerLeg,radius:0.05});
      part(foot,l.foot,point(l.foot,0,0.025,-0.02),[l.foot],1,{kind:'box',half:new THREE.Vector3(0.06,0.045,0.12)});
      joints.push({a:'pelvis',b:thigh,anchor:hip,kind:'ball'}, {a:shin,b:foot,anchor:ankle,kind:'fixed'});
      hinge(thigh,shin,hip,knee,ankle);
    }
    return { parts,joints };
  }
  return { root, board, deck, wheels, setMode, setPose, captureRagdoll, setRagdoll(active: boolean) { rider.visible = !active; if (active) { carve = manual = 0; deck.rotation.z = 0; deck.position.set(0,0,0); } }, resetPose() { motion.reset(); grabBlend = 0; carve = manual = 0; heldGroundGrab = false; rearHeadHeld = false; deck.rotation.z = 0; deck.position.set(0,0,0); heldGrab = null; board.position.set(0,0,0); board.quaternion.identity(); } };
}

/** Keep animated joints separate; combine only rigid details within the deck, head, and shoes. */
function batchStaticMeshes(parent: THREE.Group) {
  const groups = new Map<THREE.Material, { geometry: THREE.BufferGeometry; mesh: THREE.Mesh }[]>();
  for (const child of parent.children) {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) continue;
    child.updateMatrix();
    const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    geometry.applyMatrix4(child.matrix);
    const group = groups.get(child.material) ?? [];
    group.push({ geometry, mesh: child }); groups.set(child.material, group);
  }
  for (const [material, items] of groups) {
    const geometry = mergeGeometries(items.map(item => item.geometry));
    for (const item of items) item.geometry.dispose();
    if (!geometry) continue;
    for (const item of items) { parent.remove(item.mesh); item.mesh.geometry.dispose(); }
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true;
    parent.add(mesh);
  }
}
