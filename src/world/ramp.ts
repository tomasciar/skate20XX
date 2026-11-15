import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CHUNK_LENGTH, planChunk, seededRandom } from "./generation.ts";
import { makeCone, makeScenery, makeSign } from "./scenery.ts";
import type { GrindRail } from "../player/grind.ts";
import RAPIER from "@dimforge/rapier3d-compat";

/** Endless downhill: seeded chunks stream ahead; the ride surface stays put. */
export const RAMP = {
  width: 16,
  thickness: 1.0,
  angleDeg: 14,
  chunkLength: CHUNK_LENGTH,
  /** New chunks spawn this far ahead — past fog, out of sight. */
  chunksAhead: 5,
  /** Keep a little behind so despawn never flashes in the mirror. */
  chunksBehind: 2,
  centerY: 22,
} as const;

export type RampWorld = {
  mesh: THREE.Group;
  spawn: THREE.Vector3;
  anchor: THREE.Vector3;
  surfaceOrigin: THREE.Vector3;
  endZ: number;
  surfaceNormal: THREE.Vector3;
  forward: THREE.Vector3;
  get distance(): number;
  get grindRails(): readonly GrindRail[];
  scroll: (meters: number) => void;
  reset: () => void;
  prepareNextChunk: () => void;
};

type PhysPart = {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  local: THREE.Vector3;
  rot: THREE.Quaternion;
};

type Chunk = {
  index: number;
  root: THREE.Group;
  parts: PhysPart[];
  rails: { id: string; start: THREE.Vector3; end: THREE.Vector3 }[];
};

export function createRamp(scene: THREE.Scene, world: RAPIER.World): RampWorld {
  const angle = (RAMP.angleDeg * Math.PI) / 180;
  const hill = new THREE.Group();
  hill.position.set(0, RAMP.centerY, 0);
  hill.rotation.x = -angle;
  scene.add(hill);

  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-angle, 0, 0));
  const surfaceNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize();
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();

  const asphaltSource = makeAsphaltTexture();
  const metersPerTile = 7;
  asphaltSource.repeat.set(RAMP.width / 6, RAMP.chunkLength / metersPerTile);
  const mats = makeSharedMaterials();

  const span = RAMP.chunkLength * (RAMP.chunksBehind + RAMP.chunksAhead + 1);
  // One permanent deck + rails. Visuals and kickers stream; this never teleports.
  {
    const deckLocal = new THREE.Vector3(0, 0, -span / 2 + RAMP.chunksBehind * RAMP.chunkLength);
    const deckWorld = deckLocal.clone().applyQuaternion(q).add(hill.position);
    const deckBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(deckWorld.x, deckWorld.y, deckWorld.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(RAMP.width / 2, RAMP.thickness / 2, span / 2)
        .setFriction(0.9)
        .setRestitution(0),
      deckBody
    );
    for (const side of [-1, 1] as const) {
      const railLocal = new THREE.Vector3(side * (RAMP.width / 2 + 0.15), 0.7, deckLocal.z);
      const railWorld = railLocal.clone().applyQuaternion(q).add(hill.position);
      const railBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(railWorld.x, railWorld.y, railWorld.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      );
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.2, 0.55, span / 2).setFriction(0.2),
        railBody
      );
    }
  }

  const chunks = new Map<number, Chunk>();
  let cursor = 0;
  let distance = 0;
  let grindRails: GrindRail[] = [];

  function worldFromLocal(local: THREE.Vector3) {
    return local.clone().applyQuaternion(q).add(hill.position);
  }

  function syncPart(part: PhysPart) {
    const p = worldFromLocal(part.local);
    part.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    part.body.setRotation({ x: part.rot.x, y: part.rot.y, z: part.rot.z, w: part.rot.w }, true);
  }

  const asphaltMaterial = new THREE.MeshStandardMaterial({ map: asphaltSource, roughness: 0.95 });

  function destroyChunk(index: number) {
    const chunk = chunks.get(index);
    if (!chunk) return;
    for (const part of chunk.parts) {
      world.removeCollider(part.collider, true);
      world.removeRigidBody(part.body);
    }
    hill.remove(chunk.root);
    chunk.root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.geometry.dispose();
      const mat = obj.material;
      if (mat instanceof THREE.MeshStandardMaterial && mat.map && mat.map !== asphaltSource) {
        mat.map.dispose();
        mat.dispose();
      }
    });
    chunks.delete(index);
  }

  function buildChunk(index: number) {
    destroyChunk(index);
    const rng = seededRandom(Math.imul(index, 2654435761) ^ 0x9e3779b9);
    const { district, encounters } = planChunk(index);
    const root = new THREE.Group();
    const zBase = -(index - cursor) * RAMP.chunkLength;
    root.position.z = zBase;
    hill.add(root);

    const chunk: Chunk = { index, root, parts: [], rails: [] };
    chunks.set(index, chunk);

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(RAMP.width, RAMP.thickness, RAMP.chunkLength),
      asphaltMaterial
    );
    deck.receiveShadow = true;
    deck.castShadow = true;
    deck.position.set(0, 0, -RAMP.chunkLength / 2);
    root.add(deck);

    for (const side of [-1, 1] as const) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, RAMP.chunkLength), mats.rail);
      rail.position.set(side * (RAMP.width / 2 + 0.08), RAMP.thickness / 2 + 0.18, -RAMP.chunkLength / 2);
      rail.castShadow = true;
      root.add(rail);

      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.002, RAMP.chunkLength - 1),
        mats.edge
      );
      edge.position.set(side * (RAMP.width / 2 - 0.4), RAMP.thickness / 2 + 0.001, -RAMP.chunkLength / 2);
      root.add(edge);

      const bank = new THREE.Mesh(new THREE.BoxGeometry(12, 0.7, RAMP.chunkLength), mats.grass);
      bank.position.set(side * (RAMP.width / 2 + 6.2), -0.15, -RAMP.chunkLength / 2);
      bank.receiveShadow = true;
      root.add(bank);
    }

    const dashes = Math.floor(RAMP.chunkLength / 7);
    for (let i = 0; i < dashes; i++) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.002, 2.6), mats.dash);
      dash.position.set(0, RAMP.thickness / 2 + 0.001, -4 - i * 7);
      root.add(dash);
    }

    const treeRows = 5 + Math.floor(rng() * 3);
    for (let i = 0; i < treeRows; i++) {
      const along = 6 + rng() * (RAMP.chunkLength - 12);
      for (const side of [-1, 1] as const) {
        if (rng() < 0.18) continue;
        const tree = makeTree(mats, rng);
        tree.position.set(side * (RAMP.width / 2 + 2.4 + rng() * 5.5), 0.2, -along);
        root.add(tree);
        if (rng() > 0.45) {
          const pole = makeLamp(mats, side, rng);
          pole.position.set(
            side * (RAMP.width / 2 + 1.1 + rng() * 0.6),
            1.6,
            -along + 2 + rng() * 3
          );
          root.add(pole);
        }
      }
    }

    for (let i = 0; i < 5; i++) {
      for (const side of [-1, 1]) {
        const prop = makeScenery(district, i + index, rng);
        prop.position.set(side * (13 + rng() * 5), 0.3, -8 - i * 13);
        prop.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        root.add(prop);
      }
    }
    const sign = makeSign(district, index);
    sign.position.set(9.8, 0.3, -5);
    root.add(sign);

    if (rng() > 0.4) {
      const side = rng() > 0.5 ? 1 : -1;
      const far = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 5), mats.hill);
      const radius = 16 + rng() * 32;
      const height = 10 + rng() * 26;
      far.scale.set(radius, height, radius);
      far.position.set(side * (36 + rng() * 50), height * 0.35, -(rng() * RAMP.chunkLength));
      far.rotation.x = angle;
      far.rotation.y = rng() * Math.PI;
      root.add(far);
    }

    for (const item of encounters) {
      const { x, along, width, length, height, kind } = item;
      const y = RAMP.thickness / 2;
      if (kind === 'rail') {
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, length), mats.rail);
        top.position.set(x, y + height, -along); root.add(top);
        addCollider(RAPIER.ColliderDesc.cuboid(0.08, 0.07, length / 2), top.position);
        for (const z of [-length / 2 + 0.6, 0, length / 2 - 0.6]) {
          const support = new THREE.Mesh(new THREE.BoxGeometry(0.12, height, 0.12), mats.rail);
          support.position.set(x, y + height / 2, -along + z); root.add(support);
          addCollider(RAPIER.ColliderDesc.cuboid(0.06, height / 2, 0.06), support.position);
          const foot = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.5), mats.lip);
          foot.position.set(x, y + 0.025, -along + z); root.add(foot);
        }
        chunk.rails.push({ id: `${index}:${along}`, start: new THREE.Vector3(x, y + height + 0.07, -along + length / 2), end: new THREE.Vector3(x, y + height + 0.07, -along - length / 2) });
        continue;
      }
      if (kind === 'cones') {
        for (let i = 0; i < 3; i++) {
          const cone = makeCone();
          cone.position.set(x, y, -along + (i - 1) * 1.5);
          root.add(cone);
          addCollider(RAPIER.ColliderDesc.cylinder(0.32, 0.2), new THREE.Vector3(x, y + 0.32, -along + (i - 1) * 1.5));
        }
        continue;
      }
      let geometry: THREE.BufferGeometry;
      let collider: RAPIER.ColliderDesc;
      if (kind === 'kicker') {
        // A solid wedge begins flush with the asphalt; physics and render share vertices.
        const w = width / 2, l = length / 2;
        const vertices = new Float32Array([-w, 0, l, w, 0, l, -w, 0, -l, w, 0, -l, -w, height, -l, w, height, -l]);
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setIndex([0,1,5, 0,5,4, 2,4,5, 2,5,3, 0,4,2, 1,3,5, 0,2,3, 0,3,1]);
        geometry.computeVertexNormals();
        collider = RAPIER.ColliderDesc.convexHull(vertices)!;
      } else {
        geometry = new THREE.BoxGeometry(width, height, length);
        geometry.translate(0, height / 2, 0);
        collider = RAPIER.ColliderDesc.cuboid(width / 2, height / 2, length / 2);
        collider.setTranslation(0, height / 2, 0);
      }
      const mesh = new THREE.Mesh(geometry, mats.kicker);
      mesh.position.set(x, y, -along); root.add(mesh);
      addCollider(collider, mesh.position);
      // Colored lip announces the optional jump without forming a raised collision seam.
      const lip = new THREE.Mesh(new THREE.BoxGeometry(width, 0.025, 0.25), mats.lip);
      lip.position.set(x, y + height + 0.02, -along - length / 2 + 0.13); root.add(lip);
    }

    function addCollider(desc: RAPIER.ColliderDesc, local: THREE.Vector3) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      const collider = world.createCollider(desc.setFriction(0.65).setRestitution(0), body);
      const part = { body, collider, local: local.clone().add(new THREE.Vector3(0, 0, zBase)), rot: q.clone() };
      chunk.parts.push(part); syncPart(part);
    }
    batchChunk(root, new Set([asphaltMaterial, mats.grass, mats.hill]));
    root.traverse(obj => { obj.matrixAutoUpdate = false; obj.updateMatrix(); });
    root.matrixAutoUpdate = false; root.updateMatrix();
  }

  function ensureWindow() {
    const want = new Set<number>();
    for (let i = Math.max(0, cursor - RAMP.chunksBehind); i <= cursor + RAMP.chunksAhead; i++) {
      want.add(i);
    }
    for (const idx of [...chunks.keys()]) {
      if (!want.has(idx)) destroyChunk(idx);
    }
    for (const idx of want) {
      if (!chunks.has(idx)) buildChunk(idx);
    }
  }

  function placeChunk(chunk: Chunk) {
    const zBase = -(chunk.index - cursor) * RAMP.chunkLength;
    const delta = zBase - chunk.root.position.z;
    chunk.root.position.z = zBase;
    chunk.root.updateMatrix();
    for (const part of chunk.parts) {
      part.local.z += delta;
      syncPart(part);
    }
  }

  function refreshRails() { grindRails = [...chunks.values()].flatMap(chunk => chunk.rails.map(rail => ({
        id: rail.id,
        start: worldFromLocal(rail.start.clone().add(new THREE.Vector3(0, 0, chunk.root.position.z))),
        end: worldFromLocal(rail.end.clone().add(new THREE.Vector3(0, 0, chunk.root.position.z))),
      }))); }
  function prepareNextChunk() {
    const next = cursor + RAMP.chunksAhead + 1;
    if (!chunks.has(next)) { buildChunk(next); refreshRails(); }
  }

  ensureWindow();
  refreshRails();

  const anchor = worldFromLocal(new THREE.Vector3(0, RAMP.thickness / 2, 0));
  const surfaceOrigin = anchor.clone();
  const spawn = anchor.clone().addScaledVector(surfaceNormal, 0.02);

  const scroll = (meters: number) => {
    const steps = Math.round(meters / RAMP.chunkLength);
    if (steps === 0) return;
    cursor += steps;
    distance += steps * RAMP.chunkLength;
    for (const chunk of chunks.values()) placeChunk(chunk);
    ensureWindow();
    refreshRails();
  };

  const reset = () => {
    if (cursor === 0 && distance === 0) return;
    distance = 0;
    cursor = 0;
    for (const idx of [...chunks.keys()]) destroyChunk(idx);
    ensureWindow();
    refreshRails();
  };

  addBackdrop(scene);

  return {
    mesh: hill,
    spawn,
    anchor,
    surfaceOrigin,
    endZ: -99999,
    surfaceNormal,
    forward,
    get grindRails() { return grindRails; },
    prepareNextChunk,
    get distance() {
      return distance;
    },
    scroll,
    reset,
  };
}

function makeSharedMaterials() {
  return {
    rail: new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.35, metalness: 0.55 }),
    grass: new THREE.MeshStandardMaterial({ color: 0x4f8a5c, roughness: 1 }),
    edge: new THREE.MeshBasicMaterial({ color: 0xffc857 }),
    dash: new THREE.MeshBasicMaterial({ color: 0xf2f5f8 }),
    kicker: new THREE.MeshStandardMaterial({ color: 0xd5dde4, roughness: 0.55, metalness: 0.15 }),
    lip: new THREE.MeshStandardMaterial({ color: 0xff4d2e, roughness: 0.45 }),
    hill: new THREE.MeshStandardMaterial({ color: 0x4a7a58, roughness: 1, flatShading: true }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 }),
    leaves: [0x2f6b3a, 0x3c7d46, 0x245832, 0x4d8b4a].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
    ),
    buildings: [0x8d96a0, 0x6e7884, 0xb7a898, 0x5d6a78, 0xc5ccd2].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.82 })
    ),
    lamp: new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 0.6, roughness: 0.35 }),
  };
}

function makeTree(mats: ReturnType<typeof makeSharedMaterials>, rng: () => number) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.6, 6), mats.trunk);
  trunk.position.y = 0.8;
  trunk.castShadow = true;
  tree.add(trunk);
  const crown = new THREE.Mesh(
    rng() < 0.5 ? new THREE.ConeGeometry(1.2, 3.5, 7) : new THREE.IcosahedronGeometry(1.3, 1),
    mats.leaves[Math.floor(rng() * mats.leaves.length)]
  );
  crown.position.y = 2.1;
  crown.castShadow = true;
  crown.scale.set(0.75 + rng() * 0.5, 0.7 + rng() * 0.9, 0.75 + rng() * 0.5);
  tree.add(crown);
  const s = 0.65 + rng() * 1.0;
  tree.scale.set(s, 0.75 + rng() * 1.05, s);
  return tree;
}

function makeLamp(mats: ReturnType<typeof makeSharedMaterials>, side: number, rng: () => number) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), mats.lamp);
  pole.castShadow = true;
  pole.scale.y = 0.85 + rng() * 0.4;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.22), mats.lamp);
  head.position.set(side * -0.25, 1.55, 0);
  pole.add(head);
  return pole;
}

function makeAsphaltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext("2d")!;
  const rng = seededRandom(12345);
  g.fillStyle = "#6a727a";
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6000; i++) {
    const shade = 70 + rng() * 50;
    g.fillStyle = `rgba(${shade},${shade},${shade + 4},${0.15 + rng() * 0.35})`;
    g.fillRect(rng() * 512, rng() * 512, 1 + rng() * 2, 1 + rng() * 2);
  }
  g.strokeStyle = "rgba(40,40,44,0.45)";
  g.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    g.beginPath();
    let x = rng() * 512;
    let y = rng() * 512;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (rng() - 0.5) * 80;
      y += (rng() - 0.5) * 40;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function addBackdrop(scene: THREE.Scene) {
  scene.background = new THREE.Color(0x8ebfd4);
  // Full visibility to 120 m; fade out by 300 m, before the streamed road ends.
  scene.fog = new THREE.Fog(0x8ebfd4, 120, 300);

  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x6b9a5a, 1.35));
  scene.add(new THREE.AmbientLight(0xd0e4f0, 0.35));

  const sun = new THREE.DirectionalLight(0xfff3dd, 1.55);
  sun.position.set(30, 90, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 280;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.bias = -0.0002;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xb8d4e8, 0.45);
  fill.position.set(-40, 30, -20);
  scene.add(fill);

}

/** Merge static props by material: scenery variety should not mean thousands of draw calls. */
function batchChunk(root: THREE.Group, noShadow: Set<THREE.Material>) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse(obj => {
    if (!(obj instanceof THREE.Mesh) || Array.isArray(obj.material)) return;
    const geometry = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone();
    if (!geometry.getAttribute("uv")) geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geometry.getAttribute("position").count * 2), 2));
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, obj.matrixWorld));
    const list = batches.get(obj.material) ?? [];
    list.push(geometry); batches.set(obj.material, list);
    obj.geometry.dispose();
  });
  root.clear();
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = !noShadow.has(material) && material instanceof THREE.MeshStandardMaterial && !material.map;
    mesh.receiveShadow = material instanceof THREE.MeshStandardMaterial;
    root.add(mesh);
  }
}
