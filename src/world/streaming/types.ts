import type * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type {LooseCone} from '../physics/looseProps.ts';

export type PhysPart = {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  local: THREE.Vector3;
  rot: THREE.Quaternion;
};

export type Chunk = {
  index: number;
  root: THREE.Group;
  parts: PhysPart[];
  cones: LooseCone[];
  rails: { id: string; start: THREE.Vector3; end: THREE.Vector3; normal?: THREE.Vector3 }[];
};
export type ChunkStep=void|'frame';

