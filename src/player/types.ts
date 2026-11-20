import type * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type {PlayerIntent} from './controller.ts';
import type {TrickState} from './tricks/tricks.ts';
import type {createPumpCycle} from './movement/pump.ts';
import type {createGrindSystem} from './movement/grind.ts';
import type {createAirRotation} from './movement/airRotation.ts';
import type {createSlide} from './movement/slide.ts';
import type {RideMode} from '../mode.ts';
import type {CharacterId} from './characters/catalog.ts';
import type {BoardStyleId} from '../boards.ts';

export type CrashCause = 'trick' | 'obstacle' | 'inverted' | 'hardLanding' | 'impact' | 'outOfBounds';

export type BoardPlayer = {
  mesh: THREE.Group;
  body: RAPIER.RigidBody;
  grounded: boolean;
  /** Confirmed flight; brief suspension gaps keep riding controls and animation. */
  readonly airborne:boolean;
  readonly wallRiding:boolean;
  readonly landingCount:number;
  readonly landingImpact:number;
  readonly surfaceVerticalSpeed:number;
  readonly canOllie: boolean;
  readonly crashed: boolean;
  /** Why the current (or most recent) crash began; for diagnostics and tests. */
  readonly crashCause: CrashCause | null;
  readonly resetCount: number;
  readonly ollieCount: number;
  readonly pump: ReturnType<typeof createPumpCycle>["state"];
  readonly aerial: ReturnType<typeof createAirRotation>["state"];
  readonly slide: ReturnType<typeof createSlide>["state"];
  grind: ReturnType<typeof createGrindSystem>["state"];
  speed: number;
  forward: THREE.Vector3;
  uprightDot: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  update: (dt: number, intent: PlayerIntent, tricks: TrickState) => void;
  sync: (paint?: boolean) => void;
  render: (alpha: number, dt: number) => void;
  renderPosition: THREE.Vector3;
  originShift: THREE.Vector3;
  reset: (spawn: THREE.Vector3) => void;
  /** Recover locally without rewinding the streamed course. */
  respawn: () => void;
  setMode: (mode:RideMode)=>void;
  readonly boardStyle:BoardStyleId;
  setBoardStyle:(style:BoardStyleId)=>void;
  readonly character:CharacterId;
  setCharacter:(character:CharacterId)=>void;
};
