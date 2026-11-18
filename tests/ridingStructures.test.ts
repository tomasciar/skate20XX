import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {makeLandscape} from '../src/world/landscape.ts';
import {landscapeHeight} from '../src/world/landscape.ts';
import {districtAt} from '../src/world/generation.ts';
import {ridingSiteForChunk,ridingPathX} from '../src/world/ridingSites.ts';
import {makeRidingStructure,ridingStructureHeight} from '../src/world/ridingStructures.ts';
import {bakeSceneryCollision} from '../src/world/collision.ts';
import {createRamp,RAMP} from '../src/world/ramp.ts';
import {courseHeight,courseX} from '../src/world/course.ts';
import {createBoardPlayer} from '../src/player/board.ts';
import {createTrickSystem} from '../src/player/tricks/tricks.ts';
import {carveTurnRate} from '../src/player/movement/carve.ts';
import {hasRoofLaunch,ROOF_LAUNCH} from '../src/world/roofPlan.ts';
import {SIDE_BUILDING,sideBuildingForChunk} from '../src/world/exploration.ts';
import {makeSideBuilding} from '../src/world/sideBuildings.ts';
import type {PlayerIntent} from '../src/player/controller.ts';

Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})}});
const dt=1/120,idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
  wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};

test('all districts retain saturated green and yellow ground, including cities and higher slopes',()=>{
  const material=new THREE.MeshStandardMaterial(),color=new THREE.Color(),hsl={h:0,s:0,l:0},districts=new Set<string>();
  try {
    for(let index=0;index<140;index++) {
      districts.add(districtAt(index).district);const mesh=makeLandscape(index,material),colors=mesh.geometry.getAttribute('color');
      for(let i=0;i<colors.count;i++) {
        color.fromBufferAttribute(colors,i).getHSL(hsl);
        assert.ok(hsl.s>.24,`grey terrain in ${districtAt(index).district} at ${index}, saturation ${hsl.s}`);
        assert.ok(hsl.h>.09 && hsl.h<.36,'ground should remain in warm yellow/green hues');
      }
      mesh.geometry.dispose();
    }
    assert.equal(districts.size,6);
  } finally {material.dispose();}
});

test('roof kickers are occasional and leave a clear flat lane beside the launch',()=>{
  let enabled=0;
  for(let cycle=0;cycle<9;cycle++) {
    const owner=SIDE_BUILDING.firstOwner+cycle*SIDE_BUILDING.period;
    if(hasRoofLaunch(owner,SIDE_BUILDING.firstOwner,SIDE_BUILDING.period))enabled++;
  }
  assert.equal(enabled,3);
  const site=sideBuildingForChunk(2)!,root=new THREE.Group(),meshes=makeSideBuilding(site);root.add(...meshes);root.updateMatrixWorld(true);
  try {
    const kicker=root.getObjectByName('roof-exit-kicker') as THREE.Mesh;assert.ok(kicker);
    const bounds=new THREE.Box3().setFromObject(kicker);
    assert.ok(bounds.min.x>-37.6,'the normal -38 m roof line remains beside the kicker');
    assert.ok(Math.abs(bounds.min.z+(site.end-site.owner*70))<.001,'lip ends at the roof edge');
    assert.ok(Math.abs(bounds.max.y-(site.height+.5+ROOF_LAUNCH.height))<.001);
  } finally {for(const mesh of meshes)if(!mesh.geometry.userData.shared)mesh.geometry.dispose();}
});

test('new structure surfaces are open ended, solid and match their rendered collision',async()=>{
  await RAPIER.init();
  for(const owner of [8,10,14]) {
    const site=ridingSiteForChunk(owner)!;assert.equal(site.owner,owner);
    const root=new THREE.Group(),meshes=makeRidingStructure(site);root.add(...meshes);
    const baked=bakeSceneryCollision(root)!,world=new RAPIER.World({x:0,y:0,z:0});
    world.createCollider(RAPIER.ColliderDesc.trimesh(baked.vertices,baked.indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES));world.step();root.updateMatrixWorld(true);
    try {
      assert.ok(baked.indices.length/3<(site.kind==='cliff'?6000:4500));
      assert.ok(Math.abs(site.x)-site.width/2>RAMP.width/2,'leave the main asphalt route clear');
      // Probe just inside the open ends; a ray exactly coplanar with a cap edge is ambiguous.
      for(const fraction of [.001,.2,.5,.8,.999])for(const dx of [-site.width*.35,0,site.width*.35]) {
        const along=site.start+(site.end-site.start)*fraction,x=ridingPathX(site,along)+dx;
        const expected=landscapeHeight(x,along)-courseHeight(along)+ridingStructureHeight(site,x,along)+.008;
        const origin=new THREE.Vector3(x,expected+12,-(along-owner*70)),down=new THREE.Vector3(0,-1,0);
        const physical=world.castRay(new RAPIER.Ray(origin,down),20,true),visual=new THREE.Raycaster(origin,down).intersectObject(root,true)[0];
        assert.ok(physical && visual,`${site.kind}, sample=${fraction}, offset=${dx}, physics=${!!physical}, visual=${!!visual}`);assert.ok(Math.abs(physical.timeOfImpact-visual.distance)<.002);
        assert.ok(Math.abs(physical.timeOfImpact-12)<.055);
      }
      assert.equal(ridingStructureHeight(site,site.x,site.start),0);assert.equal(ridingStructureHeight(site,site.x,site.end),0);
    } finally {world.free();for(const mesh of meshes)if(!mesh.geometry.userData.shared)mesh.geometry.dispose();}
  }
});

function steer(player:ReturnType<typeof createBoardPlayer>,ramp:ReturnType<typeof createRamp>,target:number) {
  if(player.airborne)return 0;
  const along=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward),look=Math.max(10,player.speed*.4);
  const targetYaw=Math.atan2(-(target-ramp.roadOffset!(player.position)+courseX(along+look)-courseX(along)),look);
  const yaw=Math.atan2(-player.forward.x,player.forward.dot(ramp.forward));
  return THREE.MathUtils.clamp(-(targetYaw-yaw)*3/carveTurnRate(player.speed),-1,1);
}

test('the pavilion and banked channel can be ridden through in both modes',async()=>{
  await RAPIER.init();
  for(const mode of ['skate','snowboard'] as const)for(const owner of [8,10]) {
    const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
    const scene=new THREE.Scene(),ramp=createRamp(scene,world,{mode,startPlatform:false}),player=createBoardPlayer(scene,world,ramp,mode),tricks=createTrickSystem();
    const site=ridingSiteForChunk(owner)!;
    try {
      for(const speed of [20,35]) {
        ramp.reset();scene.updateMatrixWorld(true);
        const start=site.start-4,target=site.x+(site.kind==='spillway'?5.8:0);
        const at=new THREE.Vector3(target+courseX(start),landscapeHeight(target,start)+.2,-start).applyMatrix4(ramp.mesh.matrixWorld);player.reset(at);
        for(let i=0;i<20;i++){player.update(dt,idle,tricks.state);world.step();player.sync(false);}
        player.body.setLinvel(ramp.directionAt!(player.position,new THREE.Vector3()).multiplyScalar(speed),true);
        let elevated=false,exited=false;
        for(let i=0;i<1000;i++) {
          player.update(dt,{...idle,steer:steer(player,ramp,target)},tricks.state);world.step();player.sync(false);ramp.prepareNextChunk(1);
          const along=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward),offset=ramp.roadOffset!(player.position);
          const local=ramp.mesh.worldToLocal(player.position.clone()),height=local.y-courseHeight(along)+courseHeight(ramp.distance);
          assert.equal(player.crashed,false,`${mode} ${site.kind} at ${speed}: ${player.crashCause}, ${along}, x=${offset}`);
          if(along>site.start+14 && along<site.end-12 && height>landscapeHeight(offset,along)-courseHeight(along)+.35)elevated=true;
          if(along>site.end+18 && !player.airborne){exited=true;break;}
        }
        assert.ok(elevated && exited,`${mode} ${site.kind} at ${speed} must ride the structure and return to ground`);
      }
    } finally {world.free();}
  }
});

test('a roof kicker launches the actual rider, with a clear landing beyond the building in both modes',async()=>{
  await RAPIER.init();const site=sideBuildingForChunk(2)!;
  for(const mode of ['skate','snowboard'] as const) {
    const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
    const scene=new THREE.Scene(),ramp=createRamp(scene,world,{mode,startPlatform:false}),player=createBoardPlayer(scene,world,ramp,mode),tricks=createTrickSystem();
    try {
      for(const speed of [35,55]) {
        ramp.reset();scene.updateMatrixWorld(true);const start=site.end-35,x=-35;
        const at=new THREE.Vector3(x+courseX(start),courseHeight(start)+site.height+.7,-start).applyMatrix4(ramp.mesh.matrixWorld);player.reset(at);
        for(let i=0;i<20;i++){player.update(dt,idle,tricks.state);world.step();player.sync(false);}player.body.setLinvel(ramp.directionAt!(player.position,new THREE.Vector3()).multiplyScalar(speed),true);
        let lifted=false,landed=false;
        for(let i=0;i<1200;i++) {
          player.update(dt,idle,tricks.state);world.step();player.sync(false);ramp.prepareNextChunk(1);
          const along=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward),local=ramp.mesh.worldToLocal(player.position.clone());
          const height=local.y-courseHeight(along)+courseHeight(ramp.distance)-.5;
          assert.equal(player.crashed,false,`${mode} kicker at ${speed}: ${player.crashCause} at ${along}, x=${ramp.roadOffset!(player.position)}`);
          if(along>site.end && player.airborne && height>site.height+1.5)lifted=true;
          if(along>site.end+15 && !player.airborne){landed=true;break;}
        }
        assert.ok(lifted && landed,`${mode} at ${speed} should fly from the kicker and land beyond the roof`);
      }
    } finally {world.free();}
  }
});
