import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const visualMaterial=(color:number,roughness=0.8,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
export function meshPart(parent: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
}
export function boxPart(parent: THREE.Object3D, size: number[], material: THREE.Material, x = 0, y = 0, z = 0) {
  return meshPart(parent, new THREE.BoxGeometry(size[0], size[1], size[2]), material, x, y, z);
}
/** Keep animated joints separate; combine only rigid details within the deck, head, and shoes. */
export function batchStaticMeshes(parent: THREE.Group) {
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
