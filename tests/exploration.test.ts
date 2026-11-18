import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {sideRouteCenter,sideBuildingAt,sideBuildingForChunk,sideBuildingBank,explorationExclusions,SIDE_BUILDING} from '../src/world/exploration.ts';
import {makeSideBuilding} from '../src/world/sideBuildings.ts';
import {landscapeHeight} from '../src/world/landscape.ts';
import {courseHeight,courseX} from '../src/world/course.ts';
import {createRamp,RAMP} from '../src/world/ramp.ts';
import {createBoardPlayer} from '../src/player/board.ts';
import {createTrickSystem} from '../src/player/tricks/tricks.ts';
import {carveTurnRate} from '../src/player/movement/carve.ts';
import {bakeSceneryCollision} from '../src/world/collision.ts';
import type {PlayerIntent} from '../src/player/controller.ts';

Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})}});
const dt=1/120,idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
  wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};
const smooth=(v:number,a:number,b:number)=>{const t=THREE.MathUtils.clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};

test('side routes remain connected, avoid building walls and keep the road-side transition low',()=>{
  for(let along=0;along<4200;along+=2)for(const side of [-1,1]) {
    const x=sideRouteCenter(along,side),next=sideRouteCenter(along+.1,side);
    assert.ok(Math.abs(next-x)<.1,'route must not jump at a landmark boundary');
    for(const offset of [8.3,9.6,10.5,11.4,12])assert.ok(Math.abs(landscapeHeight(side*offset,along)-courseHeight(along)-.46)<1e-5);
    const site=sideBuildingAt(along);
    if(site && site.side===side && along>site.start && along<site.end)assert.ok(Math.abs(x)<SIDE_BUILDING.near-5);
  }
});

test('tall buildings vary in height and length, fit the trailing stream and keep their roof line open',()=>{
  const heights=new Set<number>(),lengths=new Set<number>(),materials=new Set<THREE.Material>();
  for(let cycle=0;cycle<3;cycle++) {
    const owner=SIDE_BUILDING.firstOwner+cycle*SIDE_BUILDING.period,site=sideBuildingForChunk(owner)!;
    heights.add(site.height);lengths.add(site.end-site.start);
    assert.equal(site.owner,owner);assert.ok(site.end< (owner+RAMP.chunksBehind+1)*RAMP.chunkLength);
    const meshes=makeSideBuilding(site),root=new THREE.Group();root.add(...meshes);
    const bounds=new THREE.Box3().setFromObject(root);
    assert.ok(bounds.max.y>=site.height+6);assert.ok(site.end-site.start>=180);
    assert.ok(bakeSceneryCollision(root)!.indices.length/3<4000);
    for(const mesh of meshes)materials.add(mesh.material as THREE.Material);
    for(const mesh of meshes)if(!mesh.geometry.userData.shared)mesh.geometry.dispose();
  }
  assert.equal(heights.size,3);assert.equal(lengths.size,3);assert.ok(materials.size<=8);
});

test('the hillside approach meets the first tall roof and keeps its footprint and landing clear',()=>{
  const site=sideBuildingForChunk(SIDE_BUILDING.firstOwner)!;
  assert.equal(site.height,12);assert.equal(site.start,132);assert.equal(site.end,312);
  assert.ok(Math.abs(landscapeHeight(-38,site.start)-courseHeight(site.start)-(site.height+.46))<.001);
  assert.equal(sideBuildingBank(-8,site.start),0);
  assert.ok(sideBuildingBank(-38,site.end+15)>site.height*.6);
  for(const index of [0,1,2,3,4,5]) {
    const areas=explorationExclusions(index);
    assert.ok(areas.length>=14);
    for(let s=0;s<70;s+=5)for(const side of [-1,1]) {
      const x=sideRouteCenter(index*70+s,side);
      assert.ok(areas.some(a=>x>a.minX && x<a.maxX && s>=a.start && s<=a.end));
    }
  }
});

/** Normal steering toward a point ahead on a chosen ground line; no forced motion or pose changes. */
function steerTo(player:ReturnType<typeof createBoardPlayer>,ramp:ReturnType<typeof createRamp>,target:(along:number)=>number) {
  if(player.airborne)return 0;
  const along=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward),look=Math.max(9,player.speed*.4);
  const desired=target(along+look)-ramp.roadOffset!(player.position)+courseX(along+look)-courseX(along);
  const targetYaw=Math.atan2(-desired,look),yaw=Math.atan2(-player.forward.x,player.forward.dot(ramp.forward));
  const error=Math.atan2(Math.sin(targetYaw-yaw),Math.cos(targetYaw-yaw));
  return THREE.MathUtils.clamp(-error*3/carveTurnRate(player.speed),-1,1);
}

test('the rider can follow the natural bank onto a tall roof and leave it in both modes',async()=>{
  await RAPIER.init();const site=sideBuildingForChunk(2)!;
  const line=(along:number)=>- (12+26*smooth(along,site.approachStart,site.start-6));
  for(const mode of ['skate','snowboard'] as const) {
    const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
    const scene=new THREE.Scene(),ramp=createRamp(scene,world,{mode,startPlatform:false}),player=createBoardPlayer(scene,world,ramp,mode),tricks=createTrickSystem();
    try {
      const start=42,x=-11;
      scene.updateMatrixWorld(true);
      const at=new THREE.Vector3(x,landscapeHeight(x,start)+.2,-start).applyMatrix4(ramp.mesh.matrixWorld);player.reset(at);
      for(let i=0;i<20;i++){player.update(dt,idle,tricks.state);world.step();player.sync(false);}
      player.body.setLinvel(ramp.forward.clone().multiplyScalar(24),true);
      let roof=false,roofMeters=0,previous=0,exit=false;
      for(let i=0;i<2600;i++) {
        player.update(dt,{...idle,steer:steerTo(player,ramp,line)},tricks.state);world.step();player.sync(false);ramp.prepareNextChunk(1);
        const along=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward),offset=ramp.roadOffset!(player.position);
        const local=ramp.mesh.worldToLocal(player.position.clone()),height=local.y-courseHeight(along)+courseHeight(ramp.distance)-.5;
        assert.equal(player.crashed,false,`${mode}: ${player.crashCause} at ${along}, x=${offset}, height=${height}`);
        if(along>site.start+5 && along<site.end-2 && !player.airborne && height>site.height-.2) {
          roof=true;if(previous)roofMeters+=along-previous;previous=along;
        } else previous=0;
        if(along>site.end+30 && !player.airborne){exit=true;break;}
      }
      assert.ok(roof && roofMeters>80 && exit,`${mode}: roof=${roof}, metres=${roofMeters}, exit=${exit}`);
    } finally {world.free();}
  }
});

test('the rider can cross the shoulder and follow a winding ground route beside the main road',async()=>{
  await RAPIER.init();const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  const scene=new THREE.Scene(),ramp=createRamp(scene,world,{startPlatform:false}),player=createBoardPlayer(scene,world,ramp),tricks=createTrickSystem();
  try {
    const at=ramp.anchor.clone().addScaledVector(ramp.forward,28).addScaledVector(ramp.surfaceNormal,.2);at.x=-6;player.reset(at);
    for(let i=0;i<20;i++){player.update(dt,idle,tricks.state);world.step();player.sync(false);}player.body.setLinvel(ramp.forward.clone().multiplyScalar(22),true);
    let outside=0,furthest=0,complete=false;
    for(let i=0;i<2600;i++) {
      player.update(dt,{...idle,steer:steerTo(player,ramp,s=>sideRouteCenter(s,-1))},tricks.state);world.step();player.sync(false);ramp.prepareNextChunk(1);
      const along=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward),offset=Math.abs(ramp.roadOffset!(player.position));
      assert.equal(player.crashed,false,`${player.crashCause} at ${along}, x=${offset}`);
      if(offset>12 && !player.airborne)outside++;furthest=Math.max(furthest,offset);
      if(along>470){complete=true;break;}
    }
    assert.ok(complete && outside>240 && furthest>28,'ride a meaningful stretch of off-road ground through the scenery');
  } finally {world.free();}
});
