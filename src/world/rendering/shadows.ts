import * as THREE from 'three';

/** Direction toward the sun: mid-morning, up the left flank of the valley. */
export const SUN_DIRECTION = new THREE.Vector3(-62, 70, 34).normalize();

/**
 * Static scenery does not use the real-time shadow map. Each chunk instead carries one mesh of soft,
 * ground-hugging shadow patches, built once with the chunk. They cost a single draw call, never pop in,
 * and stay visible as far as the fog allows; only the rider casts a real-time shadow.
 */
export const shadowMaterial = new THREE.MeshBasicMaterial({
  // No polygon offset: at grazing angles it would pull patches through the road. They sit just above the ground instead.
  color: 0x0b1622, vertexColors: true, transparent: true, depthWrite: false,
});
const DARKNESS = 0.58, CELL = 1.8;
export type ShadowKind = 'round' | 'box';
export type GroundHeight = (x: number, z: number) => number;

/** `sun` points toward the sun in the same frame as the bounds passed to `add` (Y is the ground normal). */
export function createShadowBuilder(sun: THREE.Vector3) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  // Ground displacement of a shadow per metre of caster height.
  const slopeX = -sun.x / sun.y, slopeZ = -sun.z / sun.y;

  /**
   * Adds the shadow of whatever fills `bounds`. Crowns, bushes and boulders use a soft ellipse; built
   * shapes use a rectangle with a feathered edge. `minX`/`maxX` confine the patch to the surface it is draped on:
   * one verge for roadside scenery.
   */
  function add(bounds: THREE.Box3, kind: ShadowKind, ground: GroundHeight, minX = -Infinity, maxX = Infinity, centerAt?: (z: number)=>number) {
    const cx = (bounds.min.x + bounds.max.x) / 2, cz = (bounds.min.z + bounds.max.z) / 2;
    const height = bounds.max.y - ground(cx, cz);
    if (!(height > 0.2)) return;
    const round = kind === 'round', hx = (bounds.max.x - bounds.min.x) / 2, hz = (bounds.max.z - bounds.min.z) / 2;
    // Crowns taper, so their shadow is a little shorter and narrower than the bounding box suggests.
    const reach = height * (round ? 0.8 : 1), dx = slopeX * reach, dz = slopeZ * reach, length = Math.hypot(dx, dz);
    const ux = length > 1e-4 ? dx / length : 1, uz = length > 1e-4 ? dz / length : 0, vx = -uz, vz = ux;
    const feather = round ? 0.15 : 0.5, trim = round ? 0.85 : 1;
    const alongHalf = (Math.abs(ux) * hx + Math.abs(uz) * hz) * trim, acrossHalf = (Math.abs(vx) * hx + Math.abs(vz) * hz) * trim + feather;
    const start = -alongHalf - feather, span = length + (alongHalf + feather) * 2;
    const columns = THREE.MathUtils.clamp(Math.ceil(span / CELL), round ? 4 : 3, 24);
    const rows = THREE.MathUtils.clamp(Math.ceil(acrossHalf * 2 / CELL), round ? 4 : 3, 14);
    const strength = DARKNESS * Math.min(1, 0.55 + height / 2.5), first = positions.length / 3;
    for (let i = 0; i <= columns; i++) for (let j = 0; j <= rows; j++) {
      const along = start + span * i / columns, across = acrossHalf * (j / rows * 2 - 1);
      const z = cz + uz * along + vz * across,center=centerAt?.(z) ?? 0;
      const x = THREE.MathUtils.clamp(cx + ux * along + vx * across, minX+center, maxX+center);
      positions.push(x, ground(x, z), z);
      const edge = i === 0 || i === columns || j === 0 || j === rows;
      const radius = Math.hypot((i / columns * 2 - 1), (j / rows * 2 - 1));
      colors.push(1, 1, 1, round ? strength * (1 - THREE.MathUtils.smoothstep(radius, 0.5, 1)) : edge ? 0 : strength);
    }
    for (let i = 0; i < columns; i++) for (let j = 0; j < rows; j++) {
      const a = first + i * (rows + 1) + j, b = a + 1, c = a + rows + 1, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  function build() {
    if (!indices.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, shadowMaterial);
    mesh.name = 'ground-shadows'; mesh.userData.collision = false; mesh.renderOrder = 1;
    // Purely cosmetic: picking and collision probes should see the ground beneath.
    mesh.raycast = () => {};
    return mesh;
  }
  return { add, build, get triangles() { return indices.length / 3; } };
}
