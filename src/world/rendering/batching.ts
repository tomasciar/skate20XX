import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {createWorldAppearance} from './appearance.ts';
import {applySceneryTint} from '../props/variety.ts';

/** Merge static props by material: scenery variety should not mean thousands of draw calls. */
export function* batchChunk(root: THREE.Group,appearance:ReturnType<typeof createWorldAppearance>): Generator<void> {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const meshes: THREE.Mesh[] = [];
  const movable=root.children.filter(object=>object.userData.looseProp);
  root.traverse(obj => {
    if(!(obj instanceof THREE.Mesh) || Array.isArray(obj.material))return;
    for(let ancestor:THREE.Object3D|null=obj;ancestor && ancestor!==root;ancestor=ancestor.parent)if(ancestor.userData.looseProp)return;
    meshes.push(obj);
  });
  let processed = 0;
  for (const obj of meshes) {
    const geometry = obj.geometry.clone();
    // Keep shared vertices through batching to reduce upload size and vertex/shadow work.
    if (!geometry.index) geometry.setIndex(Array.from({length:geometry.getAttribute('position').count},(_,i)=>i));
    if (!geometry.getAttribute("uv")) geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geometry.getAttribute("position").count * 2), 2));
    applySceneryTint(geometry,obj);
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, obj.matrixWorld));
    const material = obj.material as THREE.Material;
    const list = batches.get(material) ?? [];
    list.push(geometry); batches.set(material, list);
    if (!obj.geometry.userData.shared) obj.geometry.dispose();
    if (++processed % 8 === 0) yield;
  }
  root.clear();
  if(movable.length)root.add(...movable);
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    // mergeGeometries copies the data into a plain attribute; restore half-float decoding for tint RGB.
    const colors=merged.getAttribute('color');
    if(colors?.array instanceof Uint16Array)merged.setAttribute('color',new THREE.Float16BufferAttribute(colors.array,3));
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    appearance.bind(mesh,material);
    // Scenery shadows are baked onto the ground per chunk; the shadow map is reserved for the rider.
    mesh.castShadow = false;
    mesh.receiveShadow = material instanceof THREE.MeshStandardMaterial;
    root.add(mesh);
    yield;
  }
}
