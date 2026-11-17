import * as THREE from "three";
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {characterTorsoGeometry,limbGeometry,characterLegGeometry,characterHandGeometry} from '../characters/geometry.ts';
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { BOARD, FOOT_Y, RIDER } from "../dimensions.ts";
import { CARVE } from "../movement/carve.ts";
import type { RagdollRig, RagdollPart, RagdollJoint } from "../movement/ragdoll.ts";
import { TUCK, grabTransform, softenGrab } from "../animation/grabPose.ts";
import type { GrabDef } from "../tricks/grabs.ts";
import type { PumpState } from "../movement/pump.ts";
import { createRiderMotion, solveArm, solveLimb } from "../animation/pose.ts";
import {createCruisePose} from '../animation/cruisePose.ts';
import {createAirPose} from '../animation/airPose.ts';
import { sampleTrickFoot } from "../animation/trickFeet.ts";
import type { TrickFootPose } from "../animation/trickFeet.ts";
import type { GroundTrick, TrickDef } from "../tricks/tricks.ts";
import {applyRideSkin} from '../../mode.ts';
import type {RideMode} from '../../mode.ts';
import {createSnowboardVisual,SNOWBOARD} from './snowboardVisual.ts';
import {characterPalette,characterProportions,characterHasShorts} from '../characters/catalog.ts';
import {applyCharacterSkin} from '../characters/skin.ts';
import type {CharacterId} from '../characters/catalog.ts';
import {applyBoardStyle,boardMaterial,boardUVs} from '../../boards.ts';
import type {BoardStyleId} from '../../boards.ts';
import {addCharacterLooks,addCharacterLimbDetails,addCharacterShoeDetails,addCharacterHipDetails,addCharacterHandDetails} from '../characters/visuals.ts';
import {CHARACTER_MODELS} from '../characters/registry.ts';

const RIDING_GRAB = {...TUCK,offset:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},
  crouch:0.95,hipDrop:0.14,chestPitch:-0.4};
/** Radians of upper-body lean at full flip speed; `head` adds subtle neck follow-through. Rates are per second. */
export const FLIP_LEAN = {forward:0.744,back:0.696,side:0.672,head:1.1,tuck:0.36,grab:0.785,ease:15,settle:14} as const;

export type SkaterVisual = {
  root: THREE.Group;
  board: THREE.Group;
  /** Deck, grip and baseplates: rolls on the trucks while the wheels stay on the road. */
  deck: THREE.Group;
  wheels: THREE.Object3D[];
  setMode: (mode:RideMode)=>void;
  readonly boardStyle:BoardStyleId;
  setBoardStyle:(style:BoardStyleId)=>void;
  readonly character:CharacterId;
  setCharacter:(character:CharacterId)=>void;
  resetPose: () => void;
  captureRagdoll: () => RagdollRig;
  setRagdoll: (active: boolean) => void;
  setPose: (opts: {
    grab?: GrabDef | null;
    groundTrick?: GroundTrick | null;
    /** 1 riding toward the board's nose, -1 riding switch: manuals follow travel, not board yaw. */
    travelSide?: 1 | -1;
    /** Signed load while skidding sideways along the road. */
    slide?: number;
    /** Optional travel direction for a bounded glance while riding; airborne heads follow the body. */
    headForward?: THREE.Vector3;
    /** Whole-body flip rate in rider terms, -1..1: pitch onto the back, roll over the leading shoulder. */
    flipLean?: { pitch: number; roll: number };
    /** Actual angular rates in the rider's frame, normalized per axis. */
    rotationRate?:{yaw:number;pitch:number;roll:number};
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
    /** Measured ground incline along travel; used for visual knee loading through grade changes. */
    surfacePitch?:number;
    airborne: boolean;
    bail: boolean;
    wheelRoll: number;
    boardSpin: { x: number; y: number; z: number };
  }) => void;
};

export function createSkaterVisual(initialMode:RideMode='skate',initialCharacter:CharacterId='boy',initialBoardStyle:BoardStyleId='classic'): SkaterVisual {
  const root = new THREE.Group(), board = new THREE.Group(), rider = new THREE.Group(), deck = new THREE.Group();
  rider.userData.characterBuild='rider';
  root.add(board, rider); board.add(deck);
  const skateDeck=new THREE.Group(),skateGear=new THREE.Group();
  skateDeck.userData.rideSkin=skateGear.userData.rideSkin='skate';
  deck.add(skateDeck);board.add(skateGear);
  const mat = (color: number, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const grip=boardMaterial('grip'),maple=boardMaterial('edge'),orange=boardMaterial('accent'),graphic=boardMaterial('graphic');
  const steel = mat(0xaab9bf, 0.3, 0.8), rubber = boardMaterial('wheel');
  const skin = mat(0xc48a65), shirt = mat(0x267a79), pants = mat(0x293b4a);
  const thighSurface=mat(0x293b4a),shinSurface=mat(0x293b4a);
  const armSurface=mat(0xc48a65),sleeveSurface=mat(0x267a79),shoulderSurface=mat(0x267a79);
  const gloves=mat(0x202e32),kneeSurface=mat(0x202e32);
  const shoes = mat(0x253035), sole = mat(0xece1c7);
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
  gripGeo.computeVertexNormals();boardUVs(gripGeo,0.105,0.44);mesh(skateDeck, gripGeo, grip);
  const underside=new THREE.ShapeGeometry(outline,10);underside.rotateX(Math.PI/2);
  const undersidePositions=underside.getAttribute('position');
  for(let i=0;i<undersidePositions.count;i++)undersidePositions.setY(i,-0.0096+Math.max(0,Math.abs(undersidePositions.getZ(i))-0.27)*0.3);
  underside.computeVertexNormals();boardUVs(underside,0.105,0.44);mesh(skateDeck,underside,graphic);
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
  pelvis.name='pelvis';pelvis.userData.characterBuild='pelvis';
  const hipDetails=addCharacterHipDetails(hips);
  const torso = new THREE.Group(); hips.add(torso);
  const chest = mesh(torso, characterTorsoGeometry(initialCharacter), shirt, 0, 0.23, 0);
  chest.name = 'chest';chest.userData.characterBuild='chest';
  chest.scale.z = 0.65;
  box(torso, [0.23, 0.025, 0.15], shirt, 0, 0.065, 0);
  mesh(torso, new THREE.CylinderGeometry(0.044, 0.05, 0.07, 10), skin, 0, 0.44, 0);
  const head = new THREE.Group(); head.position.y = 0.53; torso.add(head);
  head.name = 'head';
  addCharacterLooks(head,torso);
  function arm(side: number) {
    const shoulder=mesh(torso,new THREE.SphereGeometry(.055,12,10),shoulderSurface);
    const upper = mesh(torso, limbGeometry('upperarm'), armSurface);
    const sleeve = mesh(torso, limbGeometry('sleeve'), sleeveSurface);
    const fore = mesh(torso, limbGeometry('forearm'), armSurface);
    const elbow = mesh(torso, new THREE.SphereGeometry(0.034, 10, 8), armSurface);
    const hand = mesh(torso, characterHandGeometry(side,false), gloves);
    addCharacterLimbDetails(upper,'upperarm',side);addCharacterLimbDetails(fore,'forearm',side);
    sleeve.name = `sleeve-${side}`;sleeve.userData.characterBuild='sleeve';
    upper.name = `upper-arm-${side}`;upper.userData.characterBuild='upperarm';
    fore.name = `forearm-${side}`;fore.userData.characterBuild='forearm';
    hand.name = `hand-${side}`;
    hand.userData.characterBuild='hand';hand.userData.handSide=side;
    addCharacterHandDetails(hand,side);
    shoulder.name=`shoulder-${side}`;shoulder.userData.characterBuild='shoulder';
    elbow.name = `elbow-${side}`;
    elbow.userData.characterBuild='elbow';
    return { side, shoulder, upper, sleeve, fore, elbow, hand,restHand:new THREE.Vector3(),restReady:false,
      airHand:new THREE.Vector3(),airReady:false };
  }
  const arms = [arm(-1), arm(1)];
  function leg(side: number) {
    const thigh = mesh(rider, characterLegGeometry('thigh'), thighSurface);
    thigh.name = `thigh-${side}`;
    thigh.userData.characterBuild='thigh';
    const shin = mesh(rider, characterLegGeometry('shin'), shinSurface);
    const knee = mesh(rider, new THREE.SphereGeometry(0.063, 10, 8), kneeSurface);
    addCharacterLimbDetails(thigh,'thigh',side);addCharacterLimbDetails(shin,'shin',side);
    knee.name = `knee-${side}`;
    knee.userData.characterBuild='knee';
    shin.name = `shin-${side}`;
    shin.userData.characterBuild='shin';
    const foot = new THREE.Group(); foot.position.set(side * 0.255, FOOT_Y, 0); rider.add(foot);
    foot.name = `foot-${side}`;
    foot.userData.characterBuild='foot';
    mesh(foot,new RoundedBoxGeometry(0.115,0.027,0.23,2,0.009),sole,0,-0.005,-0.025);
    mesh(foot,new RoundedBoxGeometry(0.105,0.055,0.21,2,0.014),shoes,0,0.03,-0.02);
    for (let i = 0; i < 3; i++) box(foot, [0.07, 0.005, 0.008], sole, 0, 0.06, -0.015 - i * 0.025);
    batchStaticMeshes(foot);addCharacterShoeDetails(foot);
    const boot=new THREE.Group();boot.userData.rideSkin='snowboard';foot.add(boot);
    mesh(boot,new RoundedBoxGeometry(0.111,0.1,0.125,2,0.012),shoes,0,0.10,0.012);
    box(boot,[0.115,0.013,0.13],orange,0,0.113,0.012);batchStaticMeshes(boot);
    const trickPose:TrickFootPose={x:0,y:0,z:0,pitch:0,yaw:0,roll:0};
    return { side, thigh, shin, knee, foot, trickPose,ankle:new THREE.Vector3() };
  }
  const legs = [leg(-1), leg(1)];
  const axis = new THREE.Vector3(0, 1, 0);
  const hipReachDelta=new THREE.Vector3();
  function segment(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
    m.position.copy(a).add(b).multiplyScalar(0.5);
    const direction = b.clone().sub(a); m.scale.y = direction.length();
    m.quaternion.setFromUnitVectors(axis, direction.normalize());
  }
  const motion = createRiderMotion();
  const cruisePose=createCruisePose(),restTarget=new THREE.Vector3();
  const airPose=createAirPose(),airTarget=new THREE.Vector3(),gripReach=new THREE.Vector3();
  let grabBlend = 0, carve = 0, manual = 0, flipPitch = 0, flipRoll = 0;
  const carveTilt = new THREE.Quaternion(), riderX = new THREE.Vector3(1,0,0), gripPivot = new THREE.Vector3(0,BOARD.gripY,0);
  let heldGrab: GrabDef | null = null;
  let heldGroundGrab = false;
  const manualRotation=new THREE.Quaternion(),manualPivot=new THREE.Vector3(),manualOffset=new THREE.Vector3();
  const inverseStance=new THREE.Quaternion();
  const headDirection=new THREE.Vector3(),headParent=new THREE.Quaternion();
  const headAngles=new THREE.Euler(0,0.65,0,'YXZ');
  let headYaw=0.65;
  const kickRotation=new THREE.Quaternion(),kickEuler=new THREE.Euler();
  let mode=initialMode,character=initialCharacter,boardStyle=initialBoardStyle,bodyScale=1,legScale=1,armScale=1,hipDrop=0,hipWidth=1,shoulderSpan=1;
  function updateAppearance() {
    const proportions=characterProportions(character);
    bodyScale=proportions.bodyScale;legScale=proportions.legScale;armScale=proportions.armScale;
    hipDrop=proportions.hipDrop;head.position.y=proportions.headHeight;
    hipWidth=proportions.hipWidth;shoulderSpan=proportions.shoulderSpan;
    const palette=characterPalette(character,mode);
    skin.color.setHex(palette.skin);shirt.color.setHex(palette.shirt);pants.color.setHex(palette.pants);armSurface.color.setHex(palette.arms);
    thighSurface.color.setHex(characterHasShorts(character)?palette.skin:palette.pants);
    shinSurface.color.setHex(characterHasShorts(character)?palette.skin:palette.pants);
    sleeveSurface.color.setHex(palette.sleeves);
    shoulderSurface.color.setHex(character==='goku'?palette.shirt:palette.sleeves);
    shoes.color.setHex(palette.shoes);gloves.color.setHex(palette.gloves);kneeSurface.color.setHex(palette.knees);
    sole.color.setHex(character==='peter'?0x3d2c23:character==='spiderman'?0x982731:character==='mj'?0x20232b:0xece1c7);
    applyCharacterSkin(root,character);
  }
  function setCharacter(next:CharacterId) {character=next;updateAppearance();}
  function setMode(next:RideMode) {
    mode=next;applyRideSkin(root,mode);
    updateAppearance();
  }
  function setBoardStyle(next:BoardStyleId){boardStyle=next;applyBoardStyle(root,next);}
  setMode(initialMode);setBoardStyle(initialBoardStyle);
  function setPose(opts: Parameters<SkaterVisual['setPose']>[0]) {
    const slide=opts.airborne || opts.grinding || opts.bail ? 0 : THREE.MathUtils.clamp(opts.slide ?? 0,-1,1);
    const m = motion.update(opts.dt, opts.crouch, opts.lean, opts.airborne && !opts.grinding, opts.push, opts.verticalSpeed, opts.speed, opts.pump, opts.grinding);
    const riding = !opts.airborne && !opts.grinding && !opts.bail;
    const groundGrab = riding ? opts.groundTrick?.grab : null;
    const selectedGrab = groundGrab ?? (opts.airborne && !opts.grinding && !opts.bail ? opts.grab : null);
    const cruise=cruisePose.update({dt:opts.dt,active:riding&&!groundGrab,
      speed:opts.speed,turn:opts.carve ?? m.lean*.6,surfacePitch:opts.surfacePitch,travelSide:opts.travelSide ?? 1});
    const footTrick=opts.airborne && !opts.grinding && !opts.bail && !selectedGrab ? opts.trick : null;
    const trickProgress=footTrick ? (opts.trickTime ?? 0)/footTrick.duration : 0;
    const air=airPose.update({dt:opts.dt,active:opts.airborne&&!opts.grinding&&!opts.bail,verticalSpeed:opts.verticalSpeed,
      turn:opts.lean,yaw:opts.rotationRate?.yaw,
      pitch:opts.rotationRate?.pitch ?? opts.flipLean?.pitch ?? 0,roll:opts.rotationRate?.roll ?? opts.flipLean?.roll ?? 0,
      travelSide:cruise.travelSide});
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
    manual = riding ? THREE.MathUtils.damp(manual,(opts.groundTrick?.manual ?? 0)*(opts.travelSide ?? 1),10,opts.dt) : 0;
    if (Math.abs(manual)<1e-5) manual=0;
    const cruiseWeight=cruise.weight*(1-grabBlend)*(1-Math.abs(manual)*.25)*(1-m.push)*(1-Math.abs(slide))
      *(1-THREE.MathUtils.smoothstep(m.crouch,.15,.65));
    // Roll about the grip centerline: the soles stay planted and the wheels stay on the road.
    const tilt = carve ? -carve * CARVE.deckTilt : 0;
    deck.rotation.z = tilt;
    deck.position.copy(gripPivot).sub(gripPivot.clone().applyEuler(deck.rotation));
    const edgeLift=mode==='snowboard' ? Math.abs(Math.sin(tilt))*SNOWBOARD.halfWidth+(1-Math.cos(tilt))*(BOARD.gripY-SNOWBOARD.baseY) : 0;
    deck.position.y+=edgeLift;
    carveTilt.setFromAxisAngle(riderX, tilt);
    // Lean into a whole-body flip: ease in with the rotation, and settle quickly once the wheels are down.
    const flip=opts.airborne && !opts.grinding && !opts.bail ? opts.flipLean : undefined;
    const flipRate=opts.airborne ? FLIP_LEAN.ease : FLIP_LEAN.settle;
    flipPitch=THREE.MathUtils.damp(flipPitch,THREE.MathUtils.clamp(flip?.pitch ?? 0,-1,1),flipRate,opts.dt);
    flipRoll=THREE.MathUtils.damp(flipRoll,THREE.MathUtils.clamp(flip?.roll ?? 0,-1,1),flipRate,opts.dt);
    if(opts.bail || (!flip?.pitch && !flip?.roll && Math.hypot(flipPitch,flipRoll)<1e-3))flipPitch=flipRoll=0;
    // Keep held-grab lean restrained so the fixed grip remains within arm's reach.
    const flipScale=1-FLIP_LEAN.grab*grabBlend;
    const rotationWeight=air.weight*(1-cruiseWeight)*flipScale;
    const spinCheck=Math.min(1,Math.max(0,Math.abs(air.hipYaw)-Math.abs(air.yaw))*2);
    const leanPitch=flipPitch*(flipPitch>0 ? FLIP_LEAN.back : FLIP_LEAN.forward)*flipScale, leanRoll=flipRoll*FLIP_LEAN.side*flipScale;
    const flipTuck=Math.min(1,Math.hypot(flipPitch,flipRoll));
    // The rear grab arches the back by itself; leaning back with a flip on top would cock the rider too far.
    const baseTweak = heldGroundGrab ? RIDING_GRAB : heldGrab?.tweak ?? TUCK;
    const tweak = heldGrab?.direction==='back' && !heldGroundGrab ? softenGrab(baseTweak,Math.max(0,flipPitch)) : baseTweak;
    const c = THREE.MathUtils.lerp(THREE.MathUtils.clamp(m.crouch+m.air*0.25+m.kneeLoad+Math.abs(manual)*0.25+Math.abs(slide)*0.5+flipTuck*FLIP_LEAN.tuck
      +cruiseWeight*(.06+cruise.pace*.035+Math.abs(cruise.turn)*.05+cruise.compression)
      +rotationWeight*(Math.abs(air.yaw)*.07+Math.abs(air.spinEffort)*.04+Math.abs(air.pitchEffort)*.04),0,1),tweak.crouch,grabBlend);
    const grabPose = grabTransform(tweak,grabBlend);
    const stance = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),RIDER.stanceY);
    board.position.copy(grabPose.offset).applyQuaternion(stance);
    const rhythm = Math.sin(m.time * 5.2);
    const breathing = Math.sin(m.time * 1.15) * .0012;
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
    const hipY = RIDER.hipHeight - hipDrop - c * 0.22 - grabBlend * tweak.hipDrop - m.landing - m.push * (0.035 + Math.abs(m.lean) * 0.025) + breathing;
    hips.position.set(pushSwing * 0.012 + m.sway * 0.5 + tweak.hipX*grabBlend + manual*0.16 - grabHand*ridingGrabBlend*0.08,
      hipY - Math.abs(carve)*0.03, 0.025 + c * 0.1 - m.lean * 0.065*(1-grabBlend) - carve*0.09 + m.sway + slide*0.07);
    // Hips counter the flip lean so the weight stays over the board.
    hips.position.x+=leanRoll*0.04;hips.position.z-=leanPitch*0.03;
    hips.position.x+=cruiseWeight*cruise.travelSide*(-.012+cruise.acceleration*.035+cruise.settle*.024);
    hips.position.z+=cruiseWeight*(cruise.settle*.008-cruise.turn*.018);
    hips.rotation.set(cruiseWeight*(cruise.settle*.025-cruise.turn*.04),
      cruiseWeight*(cruise.turn*.09+cruise.settle*.055),
      cruiseWeight*cruise.travelSide*(cruise.settle*.025+cruise.acceleration*.035));
    hips.rotation.x+=rotationWeight*air.pitchEffort*.035;
    hips.rotation.y+=rotationWeight*air.hipYaw*.10;
    hips.rotation.z+=rotationWeight*air.rollEffort*.04;
    // Toeside carves fold the chest over the toes; heelside carves sit back over the heels.
    torso.rotation.set(THREE.MathUtils.lerp(-0.08-c*0.25-m.brake*0.1,tweak.chestPitch,grabBlend) - carve*(carve>0 ? 0.26 : 0.14) - slide*0.15,
      -0.15+pushSwing*0.07+m.sway*2, m.lean*0.13-m.sway*1.2+tweak.chestRoll*grabBlend - manual*0.12 - grabHand*ridingGrabBlend*0.95);
    torso.rotation.x+=leanPitch;torso.rotation.z+=leanRoll;
    torso.rotation.x+=cruiseWeight*(-.065+(cruise.turn-cruise.chestTurn)*.13-cruise.chestSettle*.025);
    torso.rotation.y=THREE.MathUtils.lerp(torso.rotation.y,cruise.travelSide*.18+cruise.chestTurn*.14-cruise.chestSettle*.07,cruiseWeight);
    torso.rotation.z-=cruiseWeight*cruise.travelSide*(cruise.acceleration*.085+cruise.chestSettle*.035);
    torso.rotation.x+=rotationWeight*air.pitchEffort*.09;
    torso.rotation.y+=rotationWeight*(air.yaw*.22+air.spinEffort*.18);
    torso.rotation.z+=rotationWeight*air.rollEffort*.10;
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
      // Keep the deck and planted shoes at their actual size while Kick's anatomy is smaller.
      l.foot.position.divideScalar(bodyScale);
      l.ankle.set(0,.06/bodyScale,0).applyQuaternion(l.foot.quaternion).add(l.foot.position);
    }
    // A shorter rider shifts his hips slightly toward extended feet, keeping both ankles
    // connected through full-size board tweaks instead of stretching the lower legs.
    if(bodyScale<1)for(let pass=0;pass<6;pass++)for(const l of legs) {
      hipReachDelta.set(l.side*.095*hipWidth,0,0).applyQuaternion(hips.quaternion).add(hips.position).sub(l.ankle).negate();
      const distance=hipReachDelta.length(),reach=(RIDER.upperLeg+RIDER.lowerLeg)*legScale-.0002;
      if(distance>reach)hips.position.addScaledVector(hipReachDelta,(distance-reach)/distance);
    }
    for(const l of legs) {
      const hip = new THREE.Vector3(l.side * 0.095 * hipWidth, 0, 0).applyQuaternion(hips.quaternion).add(hips.position);
      const ankle=l.ankle;
      // Rear tucks fold the knees down below the hips, rather than up through the waist.
      const pole=tweak.kneePole;
      const kneePole=pole ? new THREE.Vector3(pole.x*grabBlend,pole.y*grabBlend,THREE.MathUtils.lerp(-1,pole.z,grabBlend)) : new THREE.Vector3(0,0,-1);
      const solved = solveLimb(hip, ankle, kneePole, RIDER.upperLeg*legScale, RIDER.lowerLeg*legScale);
      segment(l.thigh, hip, solved.joint); segment(l.shin, solved.joint, solved.end); l.knee.position.copy(solved.joint);
    }
    for (const a of arms) {
      const leading=(1-a.side*cruise.travelSide)/2,load=Math.abs(cruise.turn),lag=cruise.turn-cruise.armTurn;
      const airLeading=(1-a.side*air.travelSide)/2;
      const airWeight=air.weight*(1-cruiseWeight)*(heldGrab&&a.side===heldGrab.hand?1-grabBlend:1);
      const shoulderOffset=.17*(shoulderSpan-1);
      const shoulder = new THREE.Vector3(a.side * .17 * shoulderSpan, 0.36, 0);
      shoulder.y+=cruiseWeight*(-.006-leading*.008+a.side*cruise.chestTurn*.012-a.side*cruise.chestSettle*.008+manual*a.side*.012);
      shoulder.z+=cruiseWeight*(.006-leading*.018+a.side*lag*.008);
      shoulder.y+=airWeight*(air.lift*.012+air.descent*.008+a.side*air.roll*.012);
      shoulder.z+=airWeight*(air.pitch*.012+a.side*air.turn*.008);
      shoulder.z-=airWeight*a.side*(air.spinEffort*.02+air.yaw*.012);
      const spread = 0.27 + shoulderOffset + m.air * 0.07 + (opts.grinding ? 0.10 : 0) + Math.abs(manual)*0.1 + Math.abs(slide)*0.1;
      const hand = new THREE.Vector3(a.side * spread + m.lean * 0.04 - m.sway,
        -0.04 + c * 0.14 + m.air * 0.04 + a.side * pushSwing * 0.035,
        -0.08 - c * 0.16 + a.side * pushSwing * 0.11 + rhythm * 0.009);
      // Let the arms hang loosely from the leaning shoulders, with a small directional follow-through.
      hand.x+=a.side*flipTuck*0.02-leanRoll*0.1;
      hand.y+=a.side*flipRoll*0.025*flipScale;
      hand.z+=leanPitch*0.1;
      // A leading arm slightly forward and a quieter trailing arm. Their balance corrections
      // follow the hips/chest at different rates; they don't swing on a shared idle clock.
      restTarget.set(a.side*(.28+leading*.03+load*.065)+cruise.settle*.012,
        .005+leading*.025+c*.10+load*(.05+leading*.03)-a.side*cruise.chestSettle*.018,
        -.065-leading*.085-c*.09-cruise.armTurn*.055+lag*.10+cruise.acceleration*.025-a.side*cruise.chestSettle*.018);
      // Arms counter the wheel balance: reach toward the nose in a manual and toward the tail in a nose manual.
      restTarget.x-=manual*.075;
      restTarget.x+=a.side*shoulderOffset;
      restTarget.y+=Math.abs(manual)*(.09+(1-a.side*Math.sign(manual))*.0225);
      restTarget.z+=manual*a.side*.035;
      if(!a.restReady){a.restHand.copy(restTarget);a.restReady=true;}
      else a.restHand.lerp(restTarget,1-Math.exp(-(4.5+leading*1.5)*opts.dt));
      hand.lerp(a.restHand,cruiseWeight);
      const flick=footTrick?Math.sin(Math.PI*THREE.MathUtils.smoothstep(trickProgress,0,.65))
        *(1-THREE.MathUtils.smoothstep(trickProgress,.5,.85)):0;
      airTarget.set(a.side*(.32+air.lift*.10+air.descent*.07+air.launch*.04+flick*.03-Math.abs(air.yaw)*.05+spinCheck*.07)
        +air.roll*.07+air.rollEffort*.055,
        .015+airLeading*.015+air.lift*.12+air.descent*.055+air.launch*.11+a.side*air.roll*.065+a.side*air.turn*.035+airLeading*flick*.035
        +Math.abs(air.spinEffort)*.05+spinCheck*.045+Math.abs(air.yaw)*.02+Math.abs(air.pitchEffort)*.045+a.side*air.rollEffort*.045,
        -.09-airLeading*.065-air.lift*.035+air.descent*.025+air.pitch*.09+a.side*air.turn*.09+THREE.MathUtils.lerp(.02,-.025,airLeading)*flick
        -a.side*(air.spinEffort*.12+air.yaw*.03)+air.pitchEffort*.06);
      airTarget.x+=a.side*shoulderOffset;
      if(!a.airReady){a.airHand.copy(airTarget);a.airReady=true;}
      else a.airHand.lerp(airTarget,1-Math.exp(-(5+airLeading*1.5)*opts.dt));
      hand.lerp(a.airHand,airWeight);
      const reach=hand.sub(shoulder);
      const restReach=.432+leading*.015+load*.02+Math.abs(manual)*.015;
      const airReach=Math.min(.478,.445+airLeading*.008+air.descent*.02+Math.abs(air.roll)*.012+air.launch*.008-air.lift*.006
        -Math.abs(air.yaw)*.015+spinCheck*.012);
      reach.setLength(THREE.MathUtils.lerp(THREE.MathUtils.lerp(THREE.MathUtils.lerp(.475,.48,flipTuck),restReach,cruiseWeight),airReach,airWeight)*armScale);
      hand.add(shoulder);
      if (heldGrab && a.side === heldGrab.hand) {
        const grip = new THREE.Vector3(heldGrab.grip.x,heldGrab.grip.y,heldGrab.grip.z);
        if (heldGroundGrab) { grip.sub(gripPivot).applyQuaternion(carveTilt).add(gripPivot);grip.y+=edgeLift; }
        grip.applyQuaternion(grabPose.rotation).add(grabPose.offset);
        // Convert the fixed board grip into the leaning torso's coordinate system.
        grip.divideScalar(bodyScale).sub(hips.position).applyQuaternion(hips.quaternion.clone().invert()).applyQuaternion(torso.quaternion.clone().invert());
        hand.lerp(grip, grabBlend);
        // Let the shoulder reach a little when a combined flip/board tweak would
        // otherwise pull the grip beyond the arm, keeping both bone lengths intact.
        gripReach.copy(hand).sub(shoulder);
        const distance=gripReach.length();
        if(distance>.4895*armScale)shoulder.addScaledVector(gripReach,Math.min(.045+.49*(1-armScale),(distance-.4895*armScale)*grabBlend)/distance);
      }
      // Reach around the outside of the tucked leg for the rear grab.
      const solved = heldGrab?.direction==='back' && a.side===heldGrab.hand
        ? solveLimb(shoulder,hand,new THREE.Vector3(a.side*THREE.MathUtils.lerp(0.25,1.5,grabBlend),-0.1,THREE.MathUtils.lerp(1,0.1,grabBlend)),0.25*armScale,0.24*armScale)
        : solveArm(shoulder, hand, a.side,armScale);
      segment(a.upper, shoulder, solved.joint);
      a.shoulder.position.copy(shoulder);a.shoulder.quaternion.copy(a.upper.quaternion);
      segment(a.sleeve, shoulder, shoulder.clone().lerp(solved.joint, 0.55));
      segment(a.fore, solved.joint, solved.end);
      a.elbow.position.copy(solved.joint); a.hand.position.copy(solved.end);
      a.hand.quaternion.copy(a.fore.quaternion);
      a.hand.rotateY(a.side*(.55*cruiseWeight+.35*airWeight));
    }
    // Keep the feet in board space; leaning the whole skeleton used to lift one sole.
    rider.rotation.set(opts.bail ? 1.1 : 0, RIDER.stanceY, opts.bail ? 0.8 : 0);
    // Keep the gaze in the chest's frame. During an aerial spin the neck stays comfortable,
    // so the face turns with the body instead of counter-rotating toward the course.
    if(riding && opts.headForward && opts.headForward.lengthSq()>1e-6) {
      headDirection.copy(opts.headForward).normalize().applyQuaternion(torso.getWorldQuaternion(headParent).invert());
      const desired=Math.atan2(-headDirection.x,-headDirection.z);
      const stance=opts.travelSide ?? 1;
      // A small continuous glance avoids a target jump when heading crosses +/-180 degrees.
      const glance=stance*0.65+Math.sin(desired-stance*0.65)*0.24;
      headYaw=THREE.MathUtils.damp(headYaw,glance,7,opts.dt);
    }
    headAngles.y=headYaw;
    const neckPitch=THREE.MathUtils.clamp(-torso.rotation.x*0.2+leanPitch*(FLIP_LEAN.head-1),-0.22,0.22);
    const neckRoll=THREE.MathUtils.clamp(-m.lean*0.05+leanRoll*(FLIP_LEAN.head-1),-0.13,0.13);
    headAngles.x=THREE.MathUtils.damp(headAngles.x,neckPitch,10,opts.dt);
    headAngles.z=THREE.MathUtils.damp(headAngles.z,neckRoll,10,opts.dt);
    head.quaternion.setFromEuler(headAngles);

  }
  function captureRagdoll(): RagdollRig {
    root.updateMatrixWorld(true);
    const parts: RagdollPart[] = [], joints: RagdollJoint[] = [];
    const point = (object: THREE.Object3D, x = 0, y = 0, z = 0) => object.localToWorld(new THREE.Vector3(x,y,z));
    const part = (id: string, reference: THREE.Object3D, center: THREE.Vector3, objects: THREE.Object3D[], mass: number, shape: RagdollPart['shape']) => {
      // Crash colliders follow the captured anatomy. Normal riding uses the unchanged board solver.
      if(bodyScale!==1&&!id.startsWith('foot')) {
        if(shape.kind==='box')shape.half.multiplyScalar(bodyScale);
        else {shape.radius*=bodyScale;if(shape.kind==='capsule')shape.length*=bodyScale;}
      }
      parts.push({ id, center, rotation: reference.getWorldQuaternion(new THREE.Quaternion()), objects, mass, shape });
    };
    const stocky=character==='peter',build=characterProportions(character);
    const anatomy=CHARACTER_MODELS[character].ragdoll,torsoShape=anatomy?.torso,headShape=anatomy?.head;
    const limbWidths=stocky||anatomy?.matchLimbWidths;
    part('pelvis', pelvis, pelvis.getWorldPosition(new THREE.Vector3()), [pelvis,hipDetails], 12,
      { kind: 'capsule', length: .3*build.pelvisWidth, radius: .10*build.pelvisDepth });
    const torsoObjects = torso.children.filter(o => o.userData.characterAttachment || o instanceof THREE.Mesh && (!o.name || o===chest));
    part('torso', torso, torsoShape?point(torso,...torsoShape.center):point(torso,0,0.23,stocky?-.03:0), torsoObjects, 24,
      { kind: 'box', half: torsoShape?new THREE.Vector3(...torsoShape.half):stocky?new THREE.Vector3(.29,.23,.22):new THREE.Vector3(.15,.18,.09) });
    part('head', head, headShape?point(head,...headShape.center):point(head), [head], 5,
      headShape?.length!==undefined?{kind:'capsule',radius:headShape.radius,length:headShape.length}
        :{ kind: 'ball', radius: headShape?.radius??(stocky?.143:.115) });
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
      const shoulder = point(a.shoulder), elbow = point(a.elbow), wrist = point(a.hand);
      part(id, a.upper, a.upper.getWorldPosition(new THREE.Vector3()), [a.upper,a.sleeve,a.shoulder], 2.5, { kind: 'capsule', length: 0.25*armScale, radius: 0.04*(limbWidths?build.upperarm:1) });
      part(fore, a.fore, a.fore.getWorldPosition(new THREE.Vector3()), [a.fore,a.elbow], 1.5, { kind: 'capsule', length: 0.24*armScale, radius: 0.03*(limbWidths?build.forearm:1) });
      part(handId, a.hand, wrist, [a.hand], 0.5, { kind: 'ball', radius: 0.035*(limbWidths?build.hand:1) });
      joints.push({ a:'torso',b:id,anchor:shoulder,kind:'ball' }, { a:fore,b:handId,anchor:wrist,kind:'fixed' });
      hinge(id,fore,shoulder,elbow,wrist);
    }
    for (const l of legs) {
      const thigh = `thigh${l.side}`, shin = `shin${l.side}`, foot = `foot${l.side}`;
      const hip = point(hips,l.side*0.095*hipWidth), knee = point(l.knee), ankle = point(l.foot,0,0.06);
      part(thigh,l.thigh,l.thigh.getWorldPosition(new THREE.Vector3()),[l.thigh],7,{kind:'capsule',length:RIDER.upperLeg*legScale,radius:characterHasShorts(character)?.045:0.065*(character==='kick'?1.2535:limbWidths?build.thigh:1)});
      part(shin,l.shin,l.shin.getWorldPosition(new THREE.Vector3()),[l.shin,l.knee],4,{kind:'capsule',length:RIDER.lowerLeg*legScale,radius:characterHasShorts(character)?.033:0.05*(character==='kick'?1.311:limbWidths?build.shin:1)});
      part(foot,l.foot,point(l.foot,0,0.025,-0.02),[l.foot],1,{kind:'box',half:new THREE.Vector3(0.06,0.045,0.12)});
      joints.push({a:'pelvis',b:thigh,anchor:hip,kind:'ball'}, {a:shin,b:foot,anchor:ankle,kind:'fixed'});
      hinge(thigh,shin,hip,knee,ankle);
    }
    return { parts,joints,visualScale:bodyScale };
  }
  function resetCruise() {cruisePose.reset();airPose.reset();for(const arm of arms){arm.restReady=false;arm.airReady=false;}}
  return { root, board, deck, wheels, setMode, setBoardStyle, get boardStyle(){return boardStyle;}, setCharacter, get character(){return character;}, setPose, captureRagdoll,
    setRagdoll(active: boolean) {
      rider.visible = !active;
      if (active) {resetCruise();carve = manual = flipPitch = flipRoll = 0; deck.rotation.z = 0; deck.position.set(0,0,0);}
    },
    resetPose() {
      motion.reset();resetCruise();grabBlend = 0; carve = manual = flipPitch = flipRoll = 0; heldGroundGrab = false;
      headYaw=0.65;headAngles.set(0,0.65,0); deck.rotation.z = 0; deck.position.set(0,0,0); heldGrab = null; board.position.set(0,0,0); board.quaternion.identity();
    },
  };
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
