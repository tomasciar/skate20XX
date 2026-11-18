import * as THREE from 'three';
import {SUN_DIRECTION} from './rendering/shadows.ts';
import {bakeSceneryCollisionSteps} from './physics/collision.ts';
import {courseHeight, courseSlope, courseX, courseCurveSlope} from './terrain/course.ts';
import {START_PLATFORM, START_BOOST} from './structures/startPlatform.ts';
import type {GrindRail} from '../player/movement/grind.ts';
import RAPIER from '@dimforge/rapier3d-compat';
import {createWorldAppearance, surface} from './rendering/appearance.ts';
import type {RideMode} from '../mode.ts';
import {seasonForRideMode} from './rendering/season.ts';
import {createLooseCone} from './physics/looseProps.ts';
import {bankBoostSpeed} from './structures/bankFeatures.ts';
import {RAMP} from './config.ts';
import type {Chunk,PhysPart,ChunkStep} from './streaming/types.ts';
import {buildChunkContent} from './streaming/chunkBuilder.ts';
import {makeAsphaltTexture} from './rendering/textures.ts';
import {makeSharedMaterials} from './rendering/materials.ts';
import {addBackdrop} from './rendering/backdrop.ts';
import {batchChunk} from './rendering/batching.ts';

export {RAMP} from './config.ts';

export type RampWorld = {
  mesh: THREE.Group;
  spawn: THREE.Vector3;
  startPlatform?: {landingSpeed:number};
  /** Target speed of a road boost pad under this position, or zero outside the pads. */
  boostAt?: (position:THREE.Vector3)=>number;
  setMode?: (mode:RideMode)=>void;
  readonly mode?: RideMode;
  anchor: THREE.Vector3;
  surfaceOrigin: THREE.Vector3;
  endZ: number;
  surfaceNormal: THREE.Vector3;
  forward: THREE.Vector3;
  /** Local road direction for presentation/controls; `forward` remains the stable streaming axis. */
  directionAt?: (position: THREE.Vector3, out: THREE.Vector3, lookAhead?: number)=>THREE.Vector3;
  roadOffset?: (position: THREE.Vector3)=>number;
  /** Clear road center at the same course progress, in the current streamed frame. */
  recoveryAt?: (position: THREE.Vector3,out:THREE.Vector3)=>THREE.Vector3;
  get distance(): number;
  get grindRails(): readonly GrindRail[];
  scroll: (meters: number) => THREE.Vector3;
  reset: () => void;
  prepareNextChunk: (budgetMs?: number) => boolean;
  flushDeferredDestroy: (budgetMs?: number) => void;
  syncProps?:()=>void;
  renderProps?:(alpha:number)=>void;
};

export function createRamp(scene: THREE.Scene, world: RAPIER.World, options:{startPlatform?:boolean;mode?:RideMode}={}): RampWorld {
  let mode=options.mode ?? 'skate';
  const appearance=createWorldAppearance(seasonForRideMode(mode));
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
  let preparation: { index: number; steps: Generator<ChunkStep> } | null = null;

  function worldFromLocal(local: THREE.Vector3) {
    return local.clone().applyQuaternion(q).add(hill.position);
  }

  function syncPart(part: PhysPart) {
    const p = worldFromLocal(part.local);
    part.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    part.body.setRotation({ x: part.rot.x, y: part.rot.y, z: part.rot.z, w: part.rot.w }, true);
  }

  const asphaltMaterial = surface(new THREE.MeshStandardMaterial({ map: asphaltSource, roughness: 0.92 }),'road');

  function destroyChunk(index: number) {
    const chunk = chunks.get(index);
    if (!chunk) return;
    for(const cone of chunk.cones)cone.dispose();
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
  function* generateChunk(index: number): Generator<ChunkStep> {
    destroyChunk(index);
    const root = new THREE.Group(); root.visible = false;
    const baseHeight=courseHeight(index*RAMP.chunkLength);
    const baseX=courseX(index*RAMP.chunkLength);
    const zBase = -(index - cursor) * RAMP.chunkLength;
    root.position.set(baseX-courseX(cursor*RAMP.chunkLength),baseHeight-courseHeight(cursor*RAMP.chunkLength),zBase);
    hill.add(root);

    const chunk: Chunk = { index, root, parts: [], cones:[], rails: [] };
    chunks.set(index, chunk);

    const {coneMeshes,shadows}=yield* buildChunkContent({
      index,root,angle,sunOnHill,asphaltMaterial,mats,startPlatform:options.startPlatform!==false,rails:chunk.rails,
    });

    yield;
    const solid = yield* bakeSceneryCollisionSteps(root);
    if (solid) {
      // Rapier builds the triangle mesh's acceleration structure synchronously. Do not stack
      // that indivisible operation onto geometry work already done in this display frame.
      yield 'frame';
      // The valley is rideable now too. Weld its grid edges so CCD cannot turn
      // a terrain seam into an obstruction when carving outside the road.
      const flags=RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES;
      addCollider(RAPIER.ColliderDesc.trimesh(solid.vertices,solid.indices,flags),new THREE.Vector3());
      root.userData.solidMeshes = solid.meshCount; root.userData.collisionTriangles = solid.indices.length/3;
      yield 'frame';
    }

    function addCollider(desc: RAPIER.ColliderDesc, local: THREE.Vector3) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      const collider = world.createCollider(desc.setFriction(0.65).setRestitution(0), body);
      const part = { body, collider, local: local.clone().add(root.position), rot: q.clone() };
      chunk.parts.push(part); syncPart(part);
    }
    yield;
    yield* batchChunk(root,appearance);
    for(const cone of coneMeshes) {
      root.add(cone);
      cone.traverse(object=>{
        if(object instanceof THREE.Mesh && !Array.isArray(object.material)) {
          object.castShadow=false;appearance.bind(object,object.material);
        }
      });
      chunk.cones.push(createLooseCone(world,cone));
    }
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
    const x=courseX(chunk.index*RAMP.chunkLength)-courseX(cursor*RAMP.chunkLength),deltaX=x-chunk.root.position.x;
    const deltaY=y-chunk.root.position.y;
    chunk.root.position.set(x,y,zBase);
    chunk.root.updateMatrix();
    for (const part of chunk.parts) {
      part.local.z += delta; part.local.y += deltaY;
      part.local.x += deltaX;
      syncPart(part);
    }
    const shift=new THREE.Vector3(deltaX,deltaY,delta).applyQuaternion(q);
    for(const cone of chunk.cones)cone.shift(shift);
  }

  function refreshRails() {
    grindRails = [...chunks.values()].flatMap(chunk => chunk.rails.map(rail => ({
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
      const step=preparation.steps.next();
      if (step.done) {
        preparation = null;
        refreshRails();
        return next >= limit;
      }
      if(step.value==='frame' && Number.isFinite(budgetMs))return false;
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
  const spawnHeight=options.startPlatform===false ? 0 : START_PLATFORM.height*Math.cos(angle);
  const spawn = anchor.clone().addScaledVector(surfaceNormal, spawnHeight+0.02);

  const scroll = (meters: number) => {
    const steps = Math.round(meters / RAMP.chunkLength);
    if (steps === 0) return new THREE.Vector3();
    const previousHeight = courseHeight(cursor * RAMP.chunkLength);
    const previousX=courseX(cursor*RAMP.chunkLength);
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
    let spare = 1;
    for (let i = cursor - RAMP.chunksBehind; i <= cursor + RAMP.chunksAhead; i++) {
      if (chunks.has(i)) continue;
      if (i !== cursor && i !== cursor + 1) { if (spare === 0) continue; spare--; }
      buildChunk(i);
    }
    // Cached interaction positions must follow every origin rebase, including scrolls
    // served entirely by preloaded chunks.
    refreshRails();
    world.propagateModifiedBodyPositionsToColliders();
    return forward
      .clone()
      .multiplyScalar(-steps * RAMP.chunkLength)
      .addScaledVector(surfaceNormal, previousHeight - courseHeight(cursor * RAMP.chunkLength))
      .add(new THREE.Vector3(previousX-courseX(cursor*RAMP.chunkLength),0,0));
  };

  const reset = () => {
    if (preparation) { preparation.steps.return(undefined); destroyChunk(preparation.index); preparation = null; }
    if (cursor === 0 && distance === 0) {
      for(const chunk of chunks.values())for(const cone of chunk.cones)cone.reset();
      return;
    }
    distance = 0;
    cursor = 0;
    for (const idx of [...chunks.keys()]) destroyChunk(idx);
    ensureWindow();
    refreshRails();
  };

  const backdrop=addBackdrop(scene);backdrop.setSeason(appearance.season);

  return {
    mesh: hill,
    get mode(){return mode;},
    setMode(next:RideMode){mode=next;appearance.setSeason(seasonForRideMode(mode),hill);backdrop.setSeason(appearance.season);},
    spawn,
    startPlatform: options.startPlatform===false ? undefined : START_PLATFORM,
    boostAt(position) {
      const dx=position.x-anchor.x,dy=position.y-anchor.y,dz=position.z-anchor.z;
      const along=distance+dx*forward.x+dy*forward.y+dz*forward.z;
      const offset=position.x-(courseX(along)-courseX(distance));
      const clearance=dx*surfaceNormal.x+dy*surfaceNormal.y+dz*surfaceNormal.z-courseHeight(along)+courseHeight(distance);
      if(options.startPlatform!==false && Math.abs(along-START_BOOST.along)<=START_BOOST.length/2 && Math.abs(Math.abs(offset)-START_BOOST.x)<=START_BOOST.width/2 && clearance>=0 && clearance<.8)return START_BOOST.speed;
      return bankBoostSpeed(along,offset,clearance);
    },
    anchor,
    surfaceOrigin,
    endZ: -99999,
    surfaceNormal,
    forward,
    directionAt(position,out,lookAhead=0) {
      const along=distance+out.copy(position).sub(anchor).dot(forward)+lookAhead;
      return out.set(courseCurveSlope(along),courseSlope(along),-1).applyQuaternion(q).normalize();
    },
    roadOffset(position) {
      const along=distance+(position.x*forward.x+(position.y-anchor.y)*forward.y+(position.z-anchor.z)*forward.z);
      return position.x-(courseX(along)-courseX(distance));
    },
    recoveryAt(position,out) {
      const along=Math.max(0,distance+out.copy(position).sub(anchor).dot(forward));
      out.copy(anchor).addScaledVector(forward,along-distance)
        .addScaledVector(surfaceNormal,courseHeight(along)-courseHeight(distance));
      out.x+=courseX(along)-courseX(distance);
      return out;
    },
    get grindRails() { return grindRails; },
    prepareNextChunk,
    flushDeferredDestroy,
    syncProps(){for(const chunk of chunks.values())for(const cone of chunk.cones)cone.sync();},
    renderProps(alpha){for(const chunk of chunks.values())for(const cone of chunk.cones)cone.render(alpha);},
    get distance() {
      return distance;
    },
    scroll,
    reset,
  };
}
