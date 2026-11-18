import type * as THREE from 'three';
import type {RagdollRig} from '../movement/ragdoll.ts';
import type {GrabDef} from '../tricks/grabs.ts';
import type {PumpState} from '../movement/pump.ts';
import type {GroundTrick,TrickDef} from '../tricks/tricks.ts';
import type {RideMode} from '../../mode.ts';
import type {CharacterId,characterProportions} from '../characters/catalog.ts';
import type {BoardStyleId} from '../../boards.ts';

/** Live appearance choices shared by rig selection and its pose animator. */
export type SkaterAppearance={mode:RideMode;character:CharacterId;boardStyle:BoardStyleId;proportions:ReturnType<typeof characterProportions>};

export type SkaterPose={
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
};

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
  setPose: (opts:SkaterPose)=>void;
};
