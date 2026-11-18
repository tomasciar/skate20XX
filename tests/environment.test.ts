import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { bakeSceneryCollision } from '../src/world/physics/collision.ts';
import { makeLandscape, landscapeHeight, LANDSCAPE_X } from '../src/world/terrain/landscape.ts';
import * as scenery from '../src/world/props/scenery.ts';
import { makeScenery, makeCone, makeFence, makePicnic, makeSign } from '../src/world/props/scenery.ts';
import { seededRandom } from '../src/world/planning/generation.ts';
import { createRamp, RAMP } from '../src/world/ramp.ts';
import { createBoardPlayer } from '../src/player/board.ts';
import { createTrickSystem } from '../src/player/tricks/tricks.ts';
const context = new Proxy({}, {get:()=>()=>{}});
Object.assign(globalThis,{document:{createElement:()=>({width:0,height:0,getContext:()=>context})}});

function addCollision(world: RAPIER.World, root: THREE.Group) {
  const baked = bakeSceneryCollision(root)!;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(root.position.x,root.position.y,root.position.z).setRotation(root.quaternion));
  world.createCollider(RAPIER.ColliderDesc.trimesh(baked.vertices,baked.indices),body); return baked;
}

test('all scenery templates collide where their visible meshes are, including nested scales and rotations', async()=>{
  await RAPIER.init();
  const world = new RAPIER.World({x:0,y:0,z:0}), root = new THREE.Group();
  root.position.set(13,8,-20);root.rotation.set(-0.24,0.18,0);
  const props = [makeScenery('village',0,seededRandom(2)),makeScenery('village',1,seededRandom(3)),
    makeScenery('grove',1,seededRandom(4)),makeScenery('ridge',0,seededRandom(5)),
    makeScenery('grove',2,seededRandom(6)),makeCone(),makeFence(),makePicnic(),makeSign('grove',0)];
  // Every building and prop builder, so new architecture cannot ship without matching collision.
  const builders=Object.entries(scenery).filter(([name,value])=>/^make[A-Z]/.test(name) && typeof value==='function'
    && !['makeScenery','makeCone','makeFence','makePicnic','makeSign','makePaving','makeTree','makeHedge','makeYardFence','makeLamp'].includes(name));
  assert.ok(builders.length>=28,`only ${builders.length} builders found`);
  for(const [index,[,build]] of builders.entries()) props.push((build as (rng:()=>number)=>THREE.Group)(seededRandom(40+index)));
  props.push(scenery.makeHedge(),scenery.makeYardFence(),scenery.makeLamp(1,seededRandom(8)));
  for(const style of ['pine','cedar','broadleaf','birch','autumn','fruit','snag'] as const) props.push(scenery.makeTree(seededRandom(9),style));
  for (let i=0;i<props.length;i++) { const prop=props[i]!;prop.position.x=i*12;prop.rotation.y=i*0.17;prop.scale.set(1,1+(i%9)*0.03,1);root.add(prop); }
  const baked = addCollision(world,root);world.step();root.updateMatrixWorld(true);
  let expectedMeshes=0;root.traverse(o=>{if(o instanceof THREE.Mesh)expectedMeshes++;});
  assert.equal(baked.meshCount,expectedMeshes);
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0,-1,0).applyQuaternion(root.quaternion);
  for (let i=0;i<props.length;i++) {
    const origin = new THREE.Vector3(i*12,90,0).applyMatrix4(root.matrixWorld);
    raycaster.set(origin,down);
    const visual = raycaster.intersectObject(props[i]!,true)[0];
    assert.ok(visual,`probe missed template ${i}`);
    const physical=world.castRayAndGetNormal(new RAPIER.Ray(origin,down),120,true);
    assert.ok(physical);assert.ok(Math.abs(physical.timeOfImpact-visual.distance)<0.002,`template ${i} collision mismatch`);
  }
  world.free();
});

test('mesh collision preserves gaps under benches instead of blocking their full bounding box', async()=>{
  await RAPIER.init();
  const world = new RAPIER.World({x:0,y:0,z:0}), root = new THREE.Group();root.add(makeScenery('grove',1,seededRandom(7)));
  addCollision(world,root);world.step();
  assert.equal(world.castRay(new RAPIER.Ray({x:0,y:0.3,z:2},{x:0,y:0,z:-1}),4,true),null);
  assert.ok(world.castRay(new RAPIER.Ray({x:0.9,y:0.3,z:2},{x:0,y:0,z:-1}),4,true));
  world.free();
});

test('wide terrain is seamless across chunks and its support heights match collision triangles', async()=>{
  await RAPIER.init();
  const material = new THREE.MeshStandardMaterial({vertexColors:true});
  const first=makeLandscape(2,material), second=makeLandscape(3,material);
  const a=first.geometry.getAttribute('position'), b=second.geometry.getAttribute('position');
  for(let i=0;i<LANDSCAPE_X.length;i++) assert.equal(a.getY(a.count-LANDSCAPE_X.length+i),b.getY(i));
  const world = new RAPIER.World({x:0,y:0,z:0}), root = new THREE.Group();root.add(first);addCollision(world,root);world.step();
  for(const x of [-250,-140,-55,-15,0,18,60,150,250]) for(const along of [2.3,19.1,68.4]) {
    const height=landscapeHeight(x,140+along);
    const hit=world.castRayAndGetNormal(new RAPIER.Ray({x,y:height+15,z:-along},{x:0,y:-1,z:0}),30,true);
    assert.ok(hit);assert.ok(Math.abs(hit.timeOfImpact-15)<0.001,`terrain gap at ${x},${along}`);
  }
  world.free();first.geometry.dispose();second.geometry.dispose();material.dispose();
});

test('generated trees stop physical objects and rich scenery keeps a bounded physics window', async()=>{
  await RAPIER.init();
  const scene = new THREE.Scene(), world = new RAPIER.World({x:0,y:-18,z:0});world.timestep=1/120;
  const ramp = createRamp(scene,world);world.step();scene.updateMatrixWorld(true);
  // One static collider per chunk, plus one lightweight collider per movable cone.
  const live=RAMP.chunksBehind+1+RAMP.chunksAhead, full=live+RAMP.prepareLead;
  const staticColliders=()=>{let count=0;world.colliders.forEach(c=>{if(c.parent()?.isFixed())count++;});return count;};
  assert.equal(staticColliders(),full);
  // Clearings intentionally trade dense prop counts for riding space; keep the collision
  // budget bounded while the physical tree impact below verifies that scenery stays solid.
  assert.ok(ramp.mesh.children.every(chunk=>chunk.userData.collisionTriangles<30_000));
  const chunk = ramp.mesh.children.find(c=>c.position.z===0)!;
  const trunks = chunk.children.find(o=>o instanceof THREE.Mesh && (o.material as THREE.MeshStandardMaterial).color.getHex()===0x5a4030) as THREE.Mesh;
  assert.ok(trunks);
  const count = new THREE.CylinderGeometry(0.18,0.24,1.6,6).index!.count;
  const positions=trunks.geometry.getAttribute('position'), box=new THREE.Box3();
  for(let i=0;i<count;i++) box.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions,trunks.geometry.index!.getX(i)).applyMatrix4(trunks.matrixWorld));
  const target=box.getCenter(new THREE.Vector3()), origin=target.clone().add(new THREE.Vector3(-3,0,0));
  const hit=world.castRayAndGetNormal(new RAPIER.Ray(origin,{x:1,y:0,z:0}),3,true);assert.ok(hit,'tree trunk has no collision');
  const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(origin.x,origin.y,origin.z).setCcdEnabled(true));
  world.createCollider(RAPIER.ColliderDesc.ball(0.12).setRestitution(0),ball);ball.setLinvel({x:20,y:0,z:0},true);
  for(let i=0;i<20;i++)world.step();
  assert.ok(ball.translation().x<target.x+0.1,'physical body passed through a tree trunk');
  world.removeRigidBody(ball);
  // Complete an incremental preparation across an origin change, then keep streaming.
  ramp.prepareNextChunk(0);ramp.scroll(70);world.step();
  assert.ok(ramp.mesh.children.every(chunk=>chunk.visible));
  for(let i=0;i<20;i++){
    ramp.prepareNextChunk();ramp.scroll(70);world.step();
    assert.ok(staticColliders()<=full+3);assert.ok(world.colliders.len()<=(full+3)*7);
  }
  ramp.reset();world.step();assert.equal(staticColliders(),live);
  const player=createBoardPlayer(scene,world,ramp),tricks=createTrickSystem();
  const along=20,x=150;
  const ground=ramp.anchor.clone().addScaledVector(ramp.forward,along).add(new THREE.Vector3(x,0,0)).addScaledVector(ramp.surfaceNormal,landscapeHeight(x,along)-RAMP.thickness/2);
  player.reset(ground);
  const idle={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};
  for(let i=0;i<180;i++){player.update(1/120,idle,tricks.state);world.step();player.sync();assert.equal(player.crashed,false,'off-road ground should support riding');}
  world.free();
});
