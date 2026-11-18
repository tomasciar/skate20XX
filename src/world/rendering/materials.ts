import * as THREE from 'three';
import {surface} from './appearance.ts';
import {makeGroundTexture} from './textures.ts';

export function makeSharedMaterials() {
  return {
    // Saturated paint keeps obstacles readable without ground shadows; a little fill lifts shaded faces.
    rail: new THREE.MeshStandardMaterial({ color: 0xffc43d, roughness: 0.45, metalness: 0.25, emissive: 0xffc43d, emissiveIntensity: 0.04 }),
    path: surface(new THREE.MeshStandardMaterial({ color: 0xaaa58d, roughness: 1 }),'path'),
    terrain: surface(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: makeGroundTexture() }),'terrain'),
    edge: new THREE.MeshBasicMaterial({ color: 0xffc857 }),
    dash: surface(new THREE.MeshBasicMaterial({ color: 0xf2f5f8 }),'line'),
    // Ramp entries and a bank's inner edge meet the road at zero height. Bias only their
    // rendered depth so coplanar faces stay stable without raising the collision surface.
    kicker: new THREE.MeshStandardMaterial({ color: 0x1db5d0, roughness: 0.65, emissive: 0x1db5d0, emissiveIntensity: 0.06,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2 }),
    bank: new THREE.MeshStandardMaterial({ color:0x9762df,roughness:0.7,emissive:0x9762df,emissiveIntensity:0.05,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2 }),
    lip: new THREE.MeshStandardMaterial({ color: 0xffedb0, roughness: 0.6,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4 }),
    ledge: new THREE.MeshStandardMaterial({ color: 0xf46b3f, roughness: 0.8, emissive: 0xf46b3f, emissiveIntensity: 0.04 }),
    barrier: surface(new THREE.MeshStandardMaterial({ color: 0xc9c8c0, roughness: 0.85 }),'barrier'),
  };
}

