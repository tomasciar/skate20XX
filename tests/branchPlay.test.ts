import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {branchRoadAt,branchRoadX} from '../src/world/planning/branchRoads.ts';
import {branchPlayLanes,playLaneHeight,playLaneX} from '../src/world/planning/branchPlay.ts';
import {makeBranchPlay,makeBranchDockRail} from '../src/world/structures/branchPlay.ts';
import {makeBranchFeatures} from '../src/world/structures/branchFeatures.ts';
import {bakeSceneryCollision} from '../src/world/physics/collision.ts';
import {LANDMARK_MATERIALS as M} from '../src/world/structures/parts.ts';
import {createWorldAppearance} from '../src/world/rendering/appearance.ts';
import {createRamp} from '../src/world/ramp.ts';
import {courseHeight,courseX} from '../src/world/terrain/course.ts';
import {landscapeHeight} from '../src/world/terrain/landscape.ts';
import {createBoardPlayer} from '../src/player/board.ts';
import {createTrickSystem} from '../src/player/tricks/tricks.ts';
import {carveTurnRate} from '../src/player/movement/carve.ts';
import {GRIND_HEIGHT} from '../src/player/dimensions.ts';
import type {PlayerIntent} from '../src/player/controller.ts';

Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})}});
const road=branchRoadAt(350)!,lanes=branchPlayLanes(road),dt=1/120;
const idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};

test('early play lanes preview docks, rollers and a rooftop transfer without blocking either riding line',()=>{
  assert.deepEqual(lanes.map(l=>l.kind),['dock','rollers','transfer']);
  for(const lane of lanes) {
    assert.ok(lane.start<500&&lane.end<550);
    if(!lane.baseHeight)assert.ok(Math.abs(lane.offset)-lane.width/2>road.width/2);
    assert.ok(playLaneHeight(lane,lane.start)<1e-8);
    assert.ok(playLaneHeight(lane,lane.end)<1e-8);
  }
  assert.ok(lanes[0]!.end<lanes[1]!.start);
  assert.equal(lanes[2]!.baseHeight,7.6,'roof features must not become columns through the underpass');
  for(const side of [-1,1] as const)assert.deepEqual(branchPlayLanes({...road,side}).map(l=>Math.abs(l.offset)),lanes.map(l=>Math.abs(l.offset)));
});

test('new play structures retain open ground lanes, exact collision, bounded geometry and shared winter deck finishes',async()=>{
  await RAPIER.init();
  const deck=M.deck,winter=createWorldAppearance('winter');
  let meshesChecked=0;
  for(let index=4;index<=6;index++) {
    const root=new THREE.Group(),meshes=[...makeBranchPlay(index,road,deck)];root.add(...makeBranchFeatures(index,road,deck),...meshes);root.updateMatrixWorld(true);
    const baked=bakeSceneryCollision(root)!,world=new RAPIER.World({x:0,y:0,z:0});world.createCollider(RAPIER.ColliderDesc.trimesh(baked.vertices,baked.indices));world.step();
    try {
      assert.ok(baked.indices.length/3<2000);
      for(const mesh of meshes) {
        for(const value of mesh.geometry.getAttribute('position').array)assert.ok(Number.isFinite(value));
        if(!mesh.name.startsWith('branch-play-'))continue;
        meshesChecked++;const material=mesh.material as THREE.MeshStandardMaterial;
        assert.equal(material.userData.surface,'scenery');assert.equal((winter.materialFor(material) as THREE.MeshStandardMaterial).map,(winter.materialFor(deck) as THREE.MeshStandardMaterial).map);
        if(mesh.name.includes('roof'))assert.equal(material.polygonOffset,true);
      }
      const along=index*70+35,x=branchRoadX(road,along),y=landscapeHeight(x,along)-courseHeight(along);
      const underpass=world.castRay(new RAPIER.Ray({x,y:y+1.5,z:-35},{x:0,y:0,z:-1}),10,true);
      assert.equal(underpass,null,'the original ground lane stays open under the new rooftop ramps');
      const lane=lanes.find(l=>!l.baseHeight&&along>l.start+4&&along<l.end-4);
      if(lane) {
        const origin=new THREE.Vector3(playLaneX(road,lane,along),50,-35),down=new THREE.Vector3(0,-1,0);
        const visual=new THREE.Raycaster(origin,down).intersectObject(root,true).find(hit=>hit.object.userData.collision!==false);
        const physical=world.castRay(new RAPIER.Ray(origin,down),80,true);
        assert.ok(visual&&physical);assert.ok(Math.abs(visual.distance-physical.timeOfImpact)<.002);
      }
    } finally {world.free();root.traverse(o=>{if(o instanceof THREE.Mesh&&!o.geometry.userData.shared)o.geometry.dispose();});}
  }
  assert.ok(meshesChecked>=6);
});

test('dock rail matches its registered physical top and the player can catch and ollie out in both modes',async()=>{
  await RAPIER.init();
  const lane=lanes[0]!,raw=makeBranchDockRail(Math.floor(lane.railStart!/70),road,new THREE.MeshStandardMaterial())!;
  const root=new THREE.Group();root.add(...raw.meshes);root.updateMatrixWorld(true);
  const mid=raw.rail.start.clone().lerp(raw.rail.end,.5),down=raw.rail.normal.clone().negate();
  const visible=new THREE.Raycaster(mid.clone().addScaledVector(raw.rail.normal,2),down).intersectObject(root,true)[0];
  assert.ok(visible&&Math.abs(visible.distance-2)<.001);
  for(const mode of ['skate','snowboard'] as const) {
    const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
    const scene=new THREE.Scene(),ramp=createRamp(scene,world,{mode,startPlatform:false}),player=createBoardPlayer(scene,world,ramp,mode),tricks=createTrickSystem();
    try {
      const rail=ramp.grindRails.find(r=>r.id===`${road.id}:dock`)!;assert.ok(rail);
      const n=rail.normal!,tangent=rail.end.clone().sub(rail.start).normalize();
      player.body.setTranslation(rail.start.clone().lerp(rail.end,.12).addScaledVector(n,GRIND_HEIGHT+.08),true);
      player.body.setLinvel(tangent.clone().multiplyScalar(15).addScaledVector(n,-1),true);
      for(let i=0;i<15;i++){player.update(dt,idle,tricks.state);world.step();player.sync(false);}
      assert.equal(player.grind.active,true);assert.equal(player.crashed,false);
      player.update(dt,{...idle,wantOllie:true,olliePower:1},tricks.state);world.step();player.sync(false);
      assert.equal(player.grind.active,false);assert.ok(player.velocity.dot(n)>2);
      assert.equal(new Set(ramp.grindRails.map(r=>r.id)).size,ramp.grindRails.length);
    } finally {world.free();}
  }
});

test('docks, rollers and transfer jumps can be ridden end to end in both modes',async()=>{
  await RAPIER.init();
  const groundRoad=Array.from({length:40},(_,i)=>branchRoadAt(i*910+400)).find(r=>r&&branchPlayLanes(r).some(l=>l.kind==='transfer'&&!l.baseHeight))!;
  assert.ok(groundRoad);
  const cases=[...lanes.map(lane=>({route:road,lane})),{route:groundRoad,lane:branchPlayLanes(groundRoad).find(l=>l.kind==='transfer'&&!l.baseHeight)!}];
  for(const mode of ['skate','snowboard'] as const)for(const {route,lane} of cases) {
    const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
    const scene=new THREE.Scene(),ramp=createRamp(scene,world,{mode,startPlatform:false}),player=createBoardPlayer(scene,world,ramp,mode),tricks=createTrickSystem();
    try {
      const start=lane.start-6,x=playLaneX(route,lane,start),reference=landscapeHeight(branchRoadX(route,start),start);
      if(start>500)ramp.scroll(Math.floor(start/70)*70);
      scene.updateMatrixWorld(true);
      const cursor=ramp.distance;
      player.body.setTranslation(new THREE.Vector3(x+courseX(start)-courseX(cursor),reference-courseHeight(cursor)+lane.baseHeight+.2,-(start-cursor)).applyMatrix4(ramp.mesh.matrixWorld),true);
      for(let i=0;i<25;i++){player.update(dt,idle,tricks.state);world.step();player.sync(false);}
      player.body.setLinvel(ramp.forward.clone().multiplyScalar(24),true);
      let complete=false,air=0,height=0;
      for(let i=0;i<1800;i++) {
        const along=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward),look=Math.max(10,player.speed*.4);
        const target=playLaneX(route,lane,along+look)+courseX(along+look)-courseX(along)-ramp.roadOffset!(player.position);
        const yaw=Math.atan2(-player.forward.x,player.forward.dot(ramp.forward)),desired=Math.atan2(-target,look),error=Math.atan2(Math.sin(desired-yaw),Math.cos(desired-yaw));
        player.update(dt,{...idle,steer:player.airborne?0:THREE.MathUtils.clamp(-error*3/carveTurnRate(player.speed),-1,1)},tricks.state);world.step();player.sync(false);
        const s=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward);
        assert.equal(player.crashed,false,`${mode} ${lane.kind}: ${player.crashCause} at ${s}`);
        if(player.airborne)air++;
        const local=ramp.mesh.worldToLocal(player.position.clone());height=Math.max(height,local.y+courseHeight(ramp.distance)-landscapeHeight(branchRoadX(route,s),s)-lane.baseHeight);
        if(s>lane.end+8){complete=true;break;}
      }
      assert.ok(complete&&height>(lane.kind==='dock'?1:lane.kind==='rollers'?1.1:1.9),`${mode} ${lane.kind}: complete=${complete}, height=${height}`);
      if(lane.kind==='transfer')assert.ok(air>10,'transfer needs an actual airborne gap crossing');
    } finally {world.free();}
  }
});
