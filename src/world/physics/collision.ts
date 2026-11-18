import * as THREE from 'three';

/** Bake static solid meshes into one chunk-local triangle collider, preserving gaps and transforms. */
export type BakedCollision = { vertices: Float32Array; indices: Uint32Array; meshCount: number };
export function bakeSceneryCollision(root: THREE.Group) {
  const steps = bakeSceneryCollisionSteps(root);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}
export function* bakeSceneryCollisionSteps(root: THREE.Group): Generator<void, BakedCollision | null> {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const meshes: THREE.Mesh[] = [];
  let vertexCount = 0, indexCount = 0;
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (let ancestor: THREE.Object3D | null = object; ancestor; ancestor = ancestor.parent) {
      if (ancestor.userData.collision === false) return;
      if (ancestor === root) break;
    }
    meshes.push(object);
    vertexCount += object.geometry.getAttribute('position').count;
    indexCount += object.geometry.index?.count ?? object.geometry.getAttribute('position').count;
  });
  if (!vertexCount) return null;
  const vertices = new Float32Array(vertexCount * 3), indices = new Uint32Array(indexCount);
  const point = new THREE.Vector3(), transform = new THREE.Matrix4();
  let vertexOffset = 0, indexOffset = 0;
  let processed = 0;
  for (const mesh of meshes) {
    transform.multiplyMatrices(inverse, mesh.matrixWorld);
    const positions = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(transform);
      point.toArray(vertices, (vertexOffset + i) * 3);
    }
    for (let i = 0; i < (index?.count ?? positions.count); i++) indices[indexOffset++] = vertexOffset + (index ? index.getX(i) : i);
    vertexOffset += positions.count;
    if (++processed % 8 === 0) yield;
  }
  return { vertices, indices, meshCount: meshes.length };
}
