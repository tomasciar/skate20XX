import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CHUNK_LENGTH, planChunk, seededRandom } from "./generation.ts";
import { makeCone } from "./scenery.ts";
import { populateDistrict } from "./districts.ts";
import { SUN_DIRECTION, createShadowBuilder } from "./shadows.ts";
import { landscapeHeight } from "./landscape.ts";
import { bakeSceneryCollisionSteps } from "./collision.ts";
import { courseHeight, courseSlope, COURSE_STEP } from "./course.ts";
import { placeScenery } from "./placement.ts";
import { makeLandscape } from "./landscape.ts";
import type { GrindRail } from "../player/grind.ts";
import RAPIER from "@dimforge/rapier3d-compat";

/** Endless rolling downhill: road and scenery share the streamed height profile. */
export const RAMP = {
  width: 16,
  thickness: 1.0,
  angleDeg: 14,
  chunkLength: CHUNK_LENGTH,
  /** Live chunks ahead of the rider. Fog ends ~300m; keep build past that. */
  chunksAhead: 8,
  /** Extra chunks to finish off-thread before they enter the live window. */
  prepareLead: 3,
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
  scroll: (meters: number) => THREE.Vector3;
  reset: () => void;
  prepareNextChunk: (budgetMs?: number) => boolean;
  flushDeferredDestroy: (budgetMs?: number) => void;
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
  rails: { id: string; start: THREE.Vector3; end: THREE.Vector3; normal?: THREE.Vector3 }[];
};

export function createRamp(scene: THREE.Scene, world: RAPIER.World): RampWorld {
  const angle = (RAMP.angleDeg * Math.PI) / 180;
  const hill = new THREE.Group();
  hill.position.set(0, RAMP.centerY, 0);
  hill.rotation.x = -angle;
  scene.add(hill);

  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-angle, 0, 0));
  // The sun as seen from the tilted hill frame that all chunk geometry is built in.
  const sunOnHill = SUN_DIRECTION.clone().applyQuaternion(q.clone().invert());
  const surfaceNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize();
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();

  const asphaltSource = makeAsphaltTexture();
  // One tile spans the full road width, so its wheel-path wear lines up with the lanes.
  asphaltSource.repeat.set(1, RAMP.chunkLength / 14);
  const mats = makeSharedMaterials();

  const chunks = new Map<number, Chunk>();
  const deferredDestroy: number[] = [];
  let cursor = 0;
  let distance = 0;
  let grindRails: GrindRail[] = [];
  let preparation: { index: number; steps: Generator<void> } | null = null;

  function worldFromLocal(local: THREE.Vector3) {
    return local.clone().applyQuaternion(q).add(hill.position);
  }

  function syncPart(part: PhysPart) {
    const p = worldFromLocal(part.local);
    part.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    part.body.setRotation({ x: part.rot.x, y: part.rot.y, z: part.rot.z, w: part.rot.w }, true);
  }

  const asphaltMaterial = new THREE.MeshStandardMaterial({ map: asphaltSource, roughness: 0.92 });

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
      if (!obj.geometry.userData.shared) obj.geometry.dispose();
      const mat = obj.material;
      // Only textures made for this chunk (district signs) go with it; shared maps stay loaded.
      if (mat instanceof THREE.MeshStandardMaterial && mat.userData.perChunk) {
        mat.map?.dispose();
        mat.dispose();
      }
    });
    chunks.delete(index);
  }

  function buildChunk(index: number) {
    for (const _ of generateChunk(index)) { void _; }
  }
  function* generateChunk(index: number): Generator<void> {
    destroyChunk(index);
    const rng = seededRandom(Math.imul(index, 2654435761) ^ 0x9e3779b9);
    const { district, entering, encounters } = planChunk(index);
    const root = new THREE.Group(); root.visible = false;
    const baseHeight=courseHeight(index*RAMP.chunkLength);
    const zBase = -(index - cursor) * RAMP.chunkLength;
    root.position.set(0,baseHeight-courseHeight(cursor*RAMP.chunkLength),zBase);
    hill.add(root);

    const chunk: Chunk = { index, root, parts: [], rails: [] };
    chunks.set(index, chunk);

    function warpCourse(mesh: THREE.Mesh) {
      mesh.updateMatrix();
      const positions=mesh.geometry.getAttribute('position'), point=new THREE.Vector3();
      for(let i=0;i<positions.count;i++) {
        point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrix);
        point.y+=courseHeight(index*RAMP.chunkLength-point.z)-baseHeight;
        positions.setXYZ(i,point.x,point.y,point.z);
      }
      mesh.position.set(0,0,0);mesh.rotation.set(0,0,0);mesh.scale.set(1,1,1);
      mesh.updateMatrix();mesh.geometry.computeVertexNormals();return mesh;
    }
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(RAMP.width,RAMP.thickness,RAMP.chunkLength,1,1,RAMP.chunkLength/COURSE_STEP),
      asphaltMaterial
    );
    deck.receiveShadow = true;
    deck.castShadow = true;
    deck.position.set(0, 0, -RAMP.chunkLength / 2);
    root.add(warpCourse(deck));

    for (const side of [-1, 1] as const) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.5,RAMP.chunkLength,1,1,RAMP.chunkLength/COURSE_STEP), mats.barrier);
      rail.position.set(side * (RAMP.width / 2 + 0.08), RAMP.thickness / 2 + 0.18, -RAMP.chunkLength / 2);
      rail.castShadow = true;
      root.add(warpCourse(rail));

      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.12,0.002,RAMP.chunkLength,1,1,RAMP.chunkLength/COURSE_STEP),
        mats.edge
      );
      edge.position.set(side * (RAMP.width / 2 - 0.4), RAMP.thickness / 2 + 0.001, -RAMP.chunkLength / 2);
      edge.userData.collision = false;
      root.add(warpCourse(edge));
    }

    const dashes = Math.floor(RAMP.chunkLength / 7);
    for (let i = 0; i < dashes; i++) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.002,2.6,1,1,4), mats.dash);
      dash.position.set(0, RAMP.thickness / 2 + 0.001, -4 - i * 7);
      dash.userData.collision = false;
      root.add(warpCourse(dash));
    }

    root.add(makeLandscape(index,mats.terrain,baseHeight));
    for (const side of [-1,1]) {
      const path = new THREE.Mesh(new THREE.BoxGeometry(1.8,0.08,RAMP.chunkLength,1,1,RAMP.chunkLength/COURSE_STEP),mats.path);
      path.position.set(side*10.5,0.20,-RAMP.chunkLength/2); path.receiveShadow = true; root.add(warpCourse(path));
    }
    yield;
    const shadows = createShadowBuilder(sunOnHill), bounds = new THREE.Box3();
    const groundAt = (x: number, z: number) => landscapeHeight(x,index*RAMP.chunkLength-z)-baseHeight+0.1;
    const roadAt = (_x: number, z: number) => RAMP.thickness/2+courseHeight(index*RAMP.chunkLength-z)-baseHeight+0.025;
    /** Shadow of something standing on the road; it stays on the asphalt. */
    function shadeOnRoad(caster: THREE.Object3D, round = false) {
      caster.updateMatrixWorld(true);
      shadows.add(bounds.setFromObject(caster), round ? 'round' : 'box', roadAt, -RAMP.width/2+0.1, RAMP.width/2-0.1);
    }
    function plant(object: THREE.Object3D, x: number, along: number, yaw = 0) {
      const placed = placeScenery(object,x,along,index*RAMP.chunkLength,baseHeight,angle,yaw);
      // Roadside shadows are draped on the terrain, which runs underneath the raised road and footpath,
      // so each stays on its own verge. Street lamps stand inside that strip and go without.
      const verge = 11.6;
      if (object.userData.shadow !== 'none' && Math.abs(x) >= verge) {
        // Measure the prop itself, not the terrace it may stand on.
        placed.updateMatrixWorld(true);
        shadows.add(bounds.setFromObject(object), object.userData.shadow === 'round' ? 'round' : 'box', groundAt,
          x > 0 ? verge : -Infinity, x > 0 ? Infinity : -verge);
      }
      root.add(placed);
    }

    yield* populateDistrict({ district, index, entering, rng, plant });

    for (const item of encounters) {
      const { x, along, width, length, height, kind } = item;
      const y = RAMP.thickness / 2;
      if (kind === 'rail' || kind === 'ledge') {
        const s=index*RAMP.chunkLength+along;
        const startHeight=courseHeight(s-length/2)-baseHeight, endHeight=courseHeight(s+length/2)-baseHeight;
        const pitch=Math.atan2(endHeight-startHeight,length), physicalLength=Math.hypot(length,endHeight-startHeight);
        const normal=new THREE.Vector3(0,Math.cos(pitch),Math.sin(pitch));
        if (kind === 'ledge') {
          // A solid concrete ledge with steel coping: the grind line runs along its top.
          const depth=height+0.5, center=new THREE.Vector3(x,y+(startHeight+endHeight)/2+height,-along);
          const block=new THREE.Mesh(new THREE.BoxGeometry(width,depth,physicalLength),mats.ledge);
          block.position.copy(center).addScaledVector(normal,0.07-depth/2);block.rotation.x=pitch;shadeOnRoad(block);root.add(block);
          for(const side of [-1,1]) {
            const coping=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.06,physicalLength),mats.rail);
            coping.position.copy(center).addScaledVector(normal,0.045);coping.position.x+=side*(width/2-0.02);
            coping.rotation.x=pitch;coping.userData.collision=false;root.add(coping);
          }
        } else {
        const top=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.14,physicalLength),mats.rail);
        top.position.set(x,y+(startHeight+endHeight)/2+height,-along);top.rotation.x=pitch;shadeOnRoad(top);root.add(top);
        for(const z of [-length/2+0.6,0,length/2-0.6]) {
          const ground=y+courseHeight(s-z)-baseHeight;
          const upper=y+startHeight+(endHeight-startHeight)*(length/2-z)/length+height;
          const support=new THREE.Mesh(new THREE.BoxGeometry(0.12,upper-ground,0.12),mats.rail);
          support.position.set(x,(ground+upper)/2,-along+z);root.add(support);
          const foot=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.05,0.5),mats.lip);
          foot.position.set(x,ground+0.025,-along+z);root.add(foot);
        }
        }
        chunk.rails.push({id:`${index}:${along}`,normal,
          start:new THREE.Vector3(x,y+startHeight+height,-along+length/2).addScaledVector(normal,0.07),
          end:new THREE.Vector3(x,y+endHeight+height,-along-length/2).addScaledVector(normal,0.07)});
        continue;
      }
      if (kind === 'cones') {
        for (let i = 0; i < 3; i++) {
          const cone = makeCone();
          const s=index*RAMP.chunkLength+along-(i-1)*1.5;
          cone.position.set(x,y+courseHeight(s)-baseHeight,-along+(i-1)*1.5); cone.rotation.x=Math.atan(courseSlope(s));
          shadeOnRoad(cone, true); root.add(cone);
        }
        continue;
      }
      let geometry: THREE.BufferGeometry;
      if (kind === 'kicker') {
        // A solid wedge begins flush with the asphalt; physics and render share vertices.
        const w = width / 2, l = length / 2;
        const vertices = new Float32Array([-w, 0, l, w, 0, l, -w, 0, -l, w, 0, -l, -w, height, -l, w, height, -l]);
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setIndex([0,1,5, 0,5,4, 2,4,5, 2,5,3, 0,4,2, 1,3,5, 0,2,3, 0,3,1]);
        geometry.computeVertexNormals();
      } else {
        geometry = new THREE.BoxGeometry(width, height, length);
        geometry.translate(0, height / 2, 0);
      }
      const mesh = new THREE.Mesh(geometry, mats.kicker);
      mesh.position.set(x,y,-along); shadeOnRoad(warpCourse(mesh)); root.add(mesh);
      // Colored lip announces the optional jump without forming a raised collision seam.
      const lip = new THREE.Mesh(new THREE.BoxGeometry(width, 0.004, 0.25), mats.lip);
      lip.position.set(x, y + height - (kind === "kicker" ? height*0.13/length : 0) + 0.003, -along - length / 2 + 0.13); lip.userData.collision = false; root.add(warpCourse(lip));
    }

    yield;
    const solid = yield* bakeSceneryCollisionSteps(root);
    if (solid) {
      addCollider(RAPIER.ColliderDesc.trimesh(solid.vertices,solid.indices),new THREE.Vector3());
      root.userData.solidMeshes = solid.meshCount; root.userData.collisionTriangles = solid.indices.length/3;
    }

    function addCollider(desc: RAPIER.ColliderDesc, local: THREE.Vector3) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      const collider = world.createCollider(desc.setFriction(0.65).setRestitution(0), body);
      const part = { body, collider, local: local.clone().add(root.position), rot: q.clone() };
      chunk.parts.push(part); syncPart(part);
    }
    yield;
    yield* batchChunk(root);
    const shade = shadows.build();
    if (shade) { root.add(shade); root.userData.shadowTriangles = shadows.triangles; }
    root.traverse(obj => { obj.matrixAutoUpdate = false; obj.updateMatrix(); });
    root.matrixAutoUpdate = false; root.updateMatrix(); root.visible = true;
  }

  function inKeepRange(index: number) {
    return index >= cursor - RAMP.chunksBehind && index <= cursor + RAMP.chunksAhead + RAMP.prepareLead;
  }

  function ensureWindow(syncBuild = true) {
    const live = new Set<number>();
    for (let i = cursor - RAMP.chunksBehind; i <= cursor + RAMP.chunksAhead; i++) live.add(i);
    // Never drain a chunk generator on the ride frame — that hitch reads as a camera jump.
    // Sync build is only for boot/reset, or as a last resort if preload fell behind.
    if (preparation && live.has(preparation.index) && syncBuild) {
      for (const _ of preparation.steps) {
        void _;
      }
      preparation = null;
      refreshRails();
    }
    for (const idx of [...chunks.keys()]) {
      if (inKeepRange(idx) || (preparation && preparation.index === idx)) continue;
      if (syncBuild) destroyChunk(idx);
      else if (!deferredDestroy.includes(idx)) deferredDestroy.push(idx);
    }
    for (const idx of live) {
      if (!chunks.has(idx) && syncBuild) buildChunk(idx);
    }
  }

  function flushDeferredDestroy(budgetMs = 2) {
    const start = performance.now();
    // Always frees at least one chunk, then continues while the budget lasts.
    for (let first = true; deferredDestroy.length > 0 && (first || performance.now() - start < budgetMs); first = false) {
      const idx = deferredDestroy.shift()!;
      if (!chunks.has(idx)) continue;
      // Still needed again (e.g. reset) — skip.
      if (inKeepRange(idx)) continue;
      destroyChunk(idx);
    }
  }

  function placeChunk(chunk: Chunk) {
    const zBase = -(chunk.index - cursor) * RAMP.chunkLength;
    const delta = zBase-chunk.root.position.z;
    const y=courseHeight(chunk.index*RAMP.chunkLength)-courseHeight(cursor*RAMP.chunkLength);
    const deltaY=y-chunk.root.position.y;
    chunk.root.position.set(0,y,zBase);
    chunk.root.updateMatrix();
    for (const part of chunk.parts) {
      part.local.z += delta; part.local.y += deltaY;
      syncPart(part);
    }
  }

  function refreshRails() { grindRails = [...chunks.values()].flatMap(chunk => chunk.rails.map(rail => ({
        id: rail.id,
        normal: rail.normal?.clone().applyQuaternion(q),
        start: worldFromLocal(rail.start.clone().add(chunk.root.position)),
        end: worldFromLocal(rail.end.clone().add(chunk.root.position)),
      }))); }
  function prepareNextChunk(budgetMs = Infinity) {
    flushDeferredDestroy(Math.min(1.5, budgetMs * 0.25));
    const limit = cursor + RAMP.chunksAhead + RAMP.prepareLead;
    let next = cursor + RAMP.chunksAhead + 1;
    // A chunk that is still being prepared is registered already; it is unfinished work, not a finished chunk.
    while (next <= limit && chunks.has(next) && preparation?.index !== next) next++;
    if (next > limit) return true;

    if (preparation && preparation.index !== next) {
      preparation.steps.return(undefined);
      destroyChunk(preparation.index);
      preparation = null;
    }
    if (!preparation) {
      preparation = { index: next, steps: generateChunk(next) };
    }
    const start = performance.now();
    do {
      if (preparation.steps.next().done) {
        preparation = null;
        refreshRails();
        return next >= limit;
      }
    } while (performance.now() - start < budgetMs);
    return false;
  }

  ensureWindow(true);
  refreshRails();
  // Warm the offscreen lead so the first few scrolls never sync-build.
  while (!prepareNextChunk(Infinity)) {
    /* fill prepareLead */
  }

  const anchor = worldFromLocal(new THREE.Vector3(0, RAMP.thickness / 2, 0));
  const surfaceOrigin = anchor.clone();
  const spawn = anchor.clone().addScaledVector(surfaceNormal, 0.02);

  const scroll = (meters: number) => {
    const steps = Math.round(meters / RAMP.chunkLength);
    if (steps === 0) return new THREE.Vector3();
    const previousHeight = courseHeight(cursor * RAMP.chunkLength);
    cursor += steps;
    distance += steps * RAMP.chunkLength;
    for (const chunk of chunks.values()) placeChunk(chunk);
    // Rebase must stay cheap: only move/cull. New road should already be prebuilt ahead.
    ensureWindow(false);
    // Retired chunks are normally freed during idle preparation. If nothing is doing that, free them here
    // so the scene and physics world stay bounded.
    while (deferredDestroy.length > 2) flushDeferredDestroy(0);
    // If preload slipped, finish at most one missing live chunk without stalling the whole window.
    // The ground under and just ahead of the rider is never optional, however far the origin moved.
    let spare = 1, rebuilt = false;
    for (let i = cursor - RAMP.chunksBehind; i <= cursor + RAMP.chunksAhead; i++) {
      if (chunks.has(i)) continue;
      if (i !== cursor && i !== cursor + 1) { if (spare === 0) continue; spare--; }
      buildChunk(i); rebuilt = true;
    }
    if (rebuilt) refreshRails();
    world.propagateModifiedBodyPositionsToColliders();
    return forward
      .clone()
      .multiplyScalar(-steps * RAMP.chunkLength)
      .addScaledVector(surfaceNormal, previousHeight - courseHeight(cursor * RAMP.chunkLength));
  };

  const reset = () => {
    if (preparation) { preparation.steps.return(undefined); destroyChunk(preparation.index); preparation = null; }
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
    flushDeferredDestroy,
    get distance() {
      return distance;
    },
    scroll,
    reset,
  };
}

function makeSharedMaterials() {
  return {
    rail: new THREE.MeshStandardMaterial({ color: 0xc9d2d8, roughness: 0.32, metalness: 0.85 }),
    path: new THREE.MeshStandardMaterial({ color: 0xaaa58d, roughness: 1 }),
    terrain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: makeGroundTexture() }),
    edge: new THREE.MeshBasicMaterial({ color: 0xffc857 }),
    dash: new THREE.MeshBasicMaterial({ color: 0xf2f5f8 }),
    kicker: new THREE.MeshStandardMaterial({ color: 0xd5dde4, roughness: 0.55, metalness: 0.15 }),
    lip: new THREE.MeshStandardMaterial({ color: 0xff4d2e, roughness: 0.45 }),
    ledge: new THREE.MeshStandardMaterial({ color: 0xb9b6ab, roughness: 0.9 }),
    barrier: new THREE.MeshStandardMaterial({ color: 0xc9c8c0, roughness: 0.85 }),
  };
}

/** Tests and tools run without a browser canvas; they need the texture object but not its pixels. */
function canPaint(g: CanvasRenderingContext2D) {
  return typeof CanvasRenderingContext2D !== "undefined" && g instanceof CanvasRenderingContext2D;
}

function makeAsphaltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const g = canvas.getContext("2d")!;
  const rng = seededRandom(12345);
  if (canPaint(g)) {
    g.fillStyle = "#636a71";
    g.fillRect(0, 0, 1024, 1024);
    // Lengthwise wear: two slightly polished wheel paths per lane and darker oil between them.
    for (const [x, width, shade] of [[170, 150, 255], [420, 150, 255], [604, 150, 255], [854, 150, 255], [295, 70, 20], [729, 70, 20]] as const) {
      const wear = g.createLinearGradient(x - width / 2, 0, x + width / 2, 0);
      wear.addColorStop(0, `rgba(${shade},${shade},${shade},0)`); wear.addColorStop(0.5, `rgba(${shade},${shade},${shade},0.07)`);
      wear.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
      g.fillStyle = wear; g.fillRect(x - width / 2, 0, width, 1024);
    }
    // Aggregate: many fine light and dark stones.
    for (let i = 0; i < 26000; i++) {
      const shade = rng() < 0.5 ? 55 + rng() * 40 : 120 + rng() * 60;
      g.fillStyle = `rgba(${shade},${shade},${shade + 5},${0.12 + rng() * 0.3})`;
      const size = 1 + rng() * 2.2;
      g.fillRect(rng() * 1024, rng() * 1024, size, size);
    }
    // Faint resurfaced strips and fine tar-sealed cracks that wander along the road.
    for (let i = 0; i < 3; i++) {
      g.fillStyle = `rgba(40,44,50,${0.05 + rng() * 0.05})`;
      g.fillRect(rng() * 900, rng() * 900, 50 + rng() * 90, 120 + rng() * 260);
    }
    g.strokeStyle = "rgba(34,36,40,0.38)";
    g.lineCap = "round";
    g.lineJoin = "round";
    for (let i = 0; i < 9; i++) {
      g.lineWidth = 0.8 + rng() * 1.1;
      g.beginPath();
      let x = rng() * 1024;
      let y = rng() * 1024;
      g.moveTo(x, y);
      for (let k = 0; k < 14; k++) {
        x += (rng() - 0.5) * 16;
        y += 8 + rng() * 22;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

/** Near-white grass detail that multiplies the terrain's vertex colours, so districts keep their own tint. */
function makeGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext("2d")!;
  const rng = seededRandom(777);
  if (canPaint(g)) {
    g.fillStyle = "#dcdcdc";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 260; i++) {
      const shade = rng() < 0.5 ? 255 : 150, radius = 14 + rng() * 44, x = rng() * 512, y = rng() * 512;
      // Draw each blotch wrapped, so the tile repeats without a seam.
      for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) {
        const blotch = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, radius);
        blotch.addColorStop(0, `rgba(${shade},${shade},${shade},0.16)`); blotch.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
        g.fillStyle = blotch; g.fillRect(x + ox - radius, y + oy - radius, radius * 2, radius * 2);
      }
    }
    for (let i = 0; i < 9000; i++) {
      const shade = 150 + rng() * 105;
      g.fillStyle = `rgba(${shade},${shade},${shade * 0.94},${0.25 + rng() * 0.4})`;
      g.fillRect(rng() * 512, rng() * 512, 1 + rng() * 1.5, 2 + rng() * 4);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.4, 3.4);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function addBackdrop(scene: THREE.Scene) {
  scene.background = new THREE.Color(0x8ebfd4);
  // Full visibility to 120 m; fade out by 300 m, before the streamed road ends.
  scene.fog = new THREE.Fog(0x8ebfd4, 120, 300);

  scene.add(new THREE.HemisphereLight(0xdcefff, 0x6f8f58, 0.95));
  scene.add(new THREE.AmbientLight(0xd0e4f0, 0.2));

  // Mid-morning sun from up the left flank: trees and buildings throw shadows across the road.
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.1);
  sun.name = "sun";
  sun.position.copy(SUN_DIRECTION).multiplyScalar(100);
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

  const fill = new THREE.DirectionalLight(0xb8d4e8, 0.35);
  fill.position.set(40, 30, -20);
  scene.add(fill);
}

/** Merge static props by material: scenery variety should not mean thousands of draw calls. */
function* batchChunk(root: THREE.Group): Generator<void> {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const meshes: THREE.Mesh[] = [];
  root.traverse(obj => { if (obj instanceof THREE.Mesh && !Array.isArray(obj.material)) meshes.push(obj); });
  let processed = 0;
  for (const obj of meshes) {
    const geometry = obj.geometry.clone();
    // Keep shared vertices through batching to reduce upload size and vertex/shadow work.
    if (!geometry.index) geometry.setIndex(Array.from({length:geometry.getAttribute('position').count},(_,i)=>i));
    if (!geometry.getAttribute("uv")) geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geometry.getAttribute("position").count * 2), 2));
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, obj.matrixWorld));
    const material = obj.material as THREE.Material;
    const list = batches.get(material) ?? [];
    list.push(geometry); batches.set(material, list);
    if (!obj.geometry.userData.shared) obj.geometry.dispose();
    if (++processed % 8 === 0) yield;
  }
  root.clear();
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    // Scenery shadows are baked onto the ground per chunk; the shadow map is reserved for the rider.
    mesh.castShadow = false;
    mesh.receiveShadow = material instanceof THREE.MeshStandardMaterial;
    root.add(mesh);
    yield;
  }
}
