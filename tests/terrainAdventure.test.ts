import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {terrainBanksForChunk,terrainBankHeight,BANK_BOOST} from '../src/world/terrainBanks.ts';
import {makeBankFeatures} from '../src/world/bankFeatures.ts';
import {ridingSiteForChunk,ridingPathX} from '../src/world/ridingSites.ts';
import {makeRidingStructure} from '../src/world/ridingStructures.ts';
import {sideBuildingForChunk,SIDE_BUILDING,sideBuildingEntryX,sideBuildingEntryStart,sideBuildingAt} from '../src/world/exploration.ts';
import {makeSideBuilding} from '../src/world/sideBuildings.ts';
import {LANDMARK_MATERIALS} from '../src/world/environments/landmarkParts.ts';
import {hasRoofLaunch} from '../src/world/roofPlan.ts';
import {createRamp,RAMP} from '../src/world/ramp.ts';
import {landscapeHeight} from '../src/world/landscape.ts';
import {courseHeight,courseX} from '../src/world/course.ts';
import {createBoardPlayer} from '../src/player/board.ts';
import {createTrickSystem} from '../src/player/tricks/tricks.ts';
import {carveTurnRate} from '../src/player/movement/carve.ts';
import {makeStartBoostPad} from '../src/world/startPlatform.ts';
import type {PlayerIntent} from '../src/player/controller.ts';

Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})}});
const dt=1/120,idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
  wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};

function steerTo(player:ReturnType<typeof createBoardPlayer>,ramp:ReturnType<typeof createRamp>,line:(along:number)=>number) {
  if(player.airborne)return 0;
  const along=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward),look=Math.max(7,player.speed*.32);
  const target=Math.atan2(-(line(along+look)-ramp.roadOffset!(player.position)+courseX(along+look)-courseX(along)),look);
  const yaw=Math.atan2(-player.forward.x,player.forward.dot(ramp.forward)),error=Math.atan2(Math.sin(target-yaw),Math.cos(target-yaw));
  return THREE.MathUtils.clamp(-error*3/carveTurnRate(player.speed),-1,1);
}
function setup(mode:'skate'|'snowboard') {
  const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  const scene=new THREE.Scene(),ramp=createRamp(scene,world,{mode,startPlatform:false}),player=createBoardPlayer(scene,world,ramp,mode),tricks=createTrickSystem();
  function spawn(along:number,x:number,speed:number) {
    player.reset(ramp.spawn);
    // Emulate normal streamed travel before placing a fixture beyond the opening window.
    // A single long teleport intentionally does not synchronously build every skipped chunk.
    const target=Math.floor(along/RAMP.chunkLength)*RAMP.chunkLength;
    while(ramp.distance<target) {
      ramp.scroll(RAMP.chunkLength);while(!ramp.prepareNextChunk(Infinity)){}
    }
    scene.updateMatrixWorld(true);
    const at=new THREE.Vector3(x+courseX(along)-courseX(ramp.distance),landscapeHeight(x,along)-courseHeight(ramp.distance)+.2,-(along-ramp.distance)).applyMatrix4(ramp.mesh.matrixWorld);
    player.body.setTranslation(at,true);player.body.setLinvel({x:0,y:0,z:0},true);
    player.update(dt,idle,tricks.state);world.step();player.sync(false);
    for(let i=0;i<24;i++)tick(()=>x);
    player.body.setLinvel(ramp.directionAt!(player.position,new THREE.Vector3()).multiplyScalar(speed),true);
  }
  function tick(line:(along:number)=>number) {
    player.update(dt,{...idle,steer:steerTo(player,ramp,line)},tricks.state);world.step();player.sync(false);ramp.prepareNextChunk(1);
    const along=ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward);
    const local=ramp.mesh.worldToLocal(player.position.clone()),height=local.y-courseHeight(along)+courseHeight(ramp.distance)-.5;
    assert.equal(player.crashed,false,`${mode}: ${player.crashCause} at ${along}, x=${ramp.roadOffset!(player.position)}, height=${height}`);
    return {along,height};
  }
  return {world,scene,ramp,player,spawn,tick};
}

test('taller variants keep manageable approaches and their glazing below the roof line',()=>{
  const heights=new Set<number>();
  for(const owner of [2,13,30,58,86,114,142]) {
    const site=sideBuildingForChunk(owner)!;assert.equal(site.owner,owner);heights.add(site.height);
    assert.ok(site.end<(owner+RAMP.chunksBehind+1)*RAMP.chunkLength);
    if(site.height>12)assert.ok(site.height*1.5/(site.start-6-site.approachStart)<.24);
    const meshes=makeSideBuilding(site);
    for(const mesh of meshes) {
      if(mesh.material===LANDMARK_MATERIALS.glass && (Math.abs(Math.abs(mesh.position.x)-SIDE_BUILDING.near)<1 || Math.abs(Math.abs(mesh.position.x)-SIDE_BUILDING.far)<1))
        assert.ok(new THREE.Box3().setFromObject(mesh).max.y<site.height+.35,'window bands must not protrude above the facade');
      if(!mesh.geometry.userData.shared)mesh.geometry.dispose();
    }
  }
  assert.ok(heights.has(28) && heights.has(36));assert.equal(hasRoofLaunch(13,2,28),false);
});

test('standalone bank variants have no building dependency and no raised collider on their boost pad',()=>{
  const sites=[4,8,10].map(index=>terrainBanksForChunk(index).find(site=>site.owner===index)!);
  assert.deepEqual(sites.map(site=>site.kind),['boost','launch','plain']);
  for(const site of sites) {
    assert.ok(terrainBankHeight(site,site.x,(site.crestStart+site.crestEnd)/2)>0);
    assert.equal(terrainBankHeight(site,0,(site.crestStart+site.crestEnd)/2),0);
    const meshes=makeBankFeatures(site.owner);
    if(site.kind==='plain')assert.equal(meshes.length,0);
    if(site.kind==='launch')assert.ok(meshes.some(mesh=>mesh.name==='standalone-bank-kicker'));
    if(site.kind==='boost')assert.ok(meshes.length>1 && meshes.every(mesh=>mesh.userData.collision===false));
    for(const mesh of meshes)if(!mesh.geometry.userData.shared)mesh.geometry.dispose();
  }
});

test('tall-building terrain approaches are discovered before their district period and rise continuously',()=>{
  for(const owner of [30,58,86,114,142]) {
    const site=sideBuildingForChunk(owner)!;
    assert.equal(sideBuildingAt(sideBuildingEntryStart(site)+1)?.owner,owner);
    let previous=landscapeHeight(site.side*38,site.approachStart)-courseHeight(site.approachStart);
    for(let along=site.approachStart+1;along<site.start;along++) {
      const height=landscapeHeight(site.side*38,along)-courseHeight(along);
      assert.ok(Math.abs(height-previous)<.32,'avoid suddenly introducing an already-raised bank');previous=height;
    }
  }
});

test('streaming and resetting preserve shared rock and boost-arrow geometry',async()=>{
  await RAPIER.init();
  const arrow=(makeStartBoostPad().children[1] as THREE.Mesh).geometry;
  const preview=makeRidingStructure(ridingSiteForChunk(14)!);
  const rock=preview.find(mesh=>mesh.name==='cliff-outcrop')!.geometry;
  const templates=[arrow,rock].map(geometry=>({geometry,positions:geometry.getAttribute('position').array.slice()}));
  for(const mesh of preview)if(!mesh.geometry.userData.shared)mesh.geometry.dispose();
  const world=new RAPIER.World({x:0,y:-18,z:0}),scene=new THREE.Scene(),ramp=createRamp(scene,world,{startPlatform:false});
  try {
    for(let cycle=0;cycle<2;cycle++) {
      for(let index=0;index<15;index++){ramp.scroll(70);while(!ramp.prepareNextChunk(Infinity)){};}
      for(const {geometry,positions} of templates) {
        assert.equal(geometry.userData.shared,true);assert.deepEqual(geometry.getAttribute('position').array,positions);
      }
      ramp.mesh.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;
        const positions=object.geometry.getAttribute('position');
        for(let i=0;i<positions.array.length;i++)assert.ok(Number.isFinite(positions.array[i]),'streamed geometry must remain finite');
      });
      ramp.reset();
    }
  } finally {world.free();}
});

test('boost detection follows the bank surface through origin shifts and rejects airborne flyovers',async()=>{
  await RAPIER.init();const f=setup('skate'),site=terrainBanksForChunk(4).find(site=>site.kind==='boost')!;
  try {
    const along=(site.crestStart+site.crestEnd)/2;f.scene.updateMatrixWorld(true);
    const position=new THREE.Vector3(site.x+courseX(along),landscapeHeight(site.x,along)+.2,-along).applyMatrix4(f.ramp.mesh.matrixWorld);
    assert.equal(f.ramp.boostAt!(position),BANK_BOOST.speed);
    assert.equal(f.ramp.boostAt!(position.clone().addScaledVector(f.ramp.surfaceNormal,3)),0);
    assert.equal(f.ramp.boostAt!(position.clone().add(new THREE.Vector3(8,0,0))),0);
    position.add(f.ramp.scroll(210));assert.equal(f.ramp.boostAt!(position),BANK_BOOST.speed);
  } finally {f.world.free();}
});

test('the standalone boost bank and launch bank ride and land in both modes',async()=>{
  await RAPIER.init();
  for(const mode of ['skate','snowboard'] as const) {
    const f=setup(mode);
    try {
      for(const owner of [4,8,10]) {
        const site=terrainBanksForChunk(owner).find(site=>site.owner===owner)!;
        f.spawn(site.crestStart-35,site.x,site.kind==='boost'?18:25);
        let peakSpeed=0,lifted=false,finished=false;
        for(let i=0;i<1800;i++) {
          const {along,height}=f.tick(()=>site.x);peakSpeed=Math.max(peakSpeed,f.player.speed);
          if(along>site.crestEnd && f.player.airborne && height>site.height+1.3)lifted=true;
          if(along>site.end+28 && !f.player.airborne){finished=true;break;}
        }
        assert.ok(finished,`${mode} ${site.kind} should return to the ground`);
        if(site.kind==='boost')assert.ok(peakSpeed>=BANK_BOOST.speed-.5,'crest pad should accelerate a grounded rider');
        if(site.kind==='launch')assert.ok(lifted,'the crest kicker should launch over open terrain');
      }
    } finally {f.world.free();}
  }
});

test('the cliff shelf creates a substantial S turn while staying entirely beside the main road',()=>{
  const site=ridingSiteForChunk(14)!;assert.equal(site.kind,'cliff');
  const start=ridingPathX(site,site.start),middle=ridingPathX(site,(site.start+site.end)/2),end=ridingPathX(site,site.end);
  assert.ok(Math.abs(middle-start)>25);assert.equal(start,end);
  let maxHeading=0;
  for(let s=site.start;s<site.end;s++) {
    maxHeading=Math.max(maxHeading,Math.abs(Math.atan2(ridingPathX(site,s+1)-ridingPathX(site,s),1)));
    assert.ok(Math.abs(ridingPathX(site,s))-site.width/2>RAMP.width/2);
  }
  assert.ok(maxHeading>Math.PI/6,'turn noticeably more sharply than the main road');
  const meshes=makeRidingStructure(site);assert.equal(meshes.filter(mesh=>mesh.name==='cliff-outcrop').length,3);
  for(const mesh of meshes)if(!mesh.geometry.userData.shared)mesh.geometry.dispose();
});

test('the cliff shelf can be carved through in both riding modes',async()=>{
  await RAPIER.init();const site=ridingSiteForChunk(14)!;
  for(const mode of ['skate','snowboard'] as const) {
    const f=setup(mode);
    try {
      for(const speed of [18,26]) {
        f.spawn(site.start-4,site.x,speed);let reached=false,finished=false,maxDeviation=0;
        for(let i=0;i<1800;i++) {
          const {along,height}=f.tick(s=>ridingPathX(site,s));
          if(along>site.start+30 && along<site.end-30) {
            maxDeviation=Math.max(maxDeviation,Math.abs(f.ramp.roadOffset!(f.player.position)-ridingPathX(site,along)));
            if(height>4 && !f.player.airborne)reached=true;
          }
          if(along>site.end+18 && !f.player.airborne){finished=true;break;}
        }
        assert.ok(reached && finished && maxDeviation<site.width/2,`${mode} at ${speed}: shelf=${reached}, exit=${finished}, deviation=${maxDeviation}`);
      }
    } finally {f.world.free();}
  }
});

test('the early 28 m roof remains reachable from its longer terrain approach in both modes',async()=>{
  await RAPIER.init();const site=sideBuildingForChunk(13)!;
  const line=(along:number)=>sideBuildingEntryX(site,along);
  for(const mode of ['skate','snowboard'] as const) {
    const f=setup(mode);
    try {
      f.spawn(sideBuildingEntryStart(site)-4,12,24);let meters=0,previous=0,exited=false;
      for(let i=0;i<3000;i++) {
        const {along,height}=f.tick(line);
        if(along>site.start+5 && along<site.end-3 && height>site.height-.2 && !f.player.airborne) {
          if(previous)meters+=along-previous;previous=along;
        } else previous=0;
        if(along>site.end+30 && !f.player.airborne){exited=true;break;}
      }
      assert.ok(meters>100 && exited,`${mode} should ride the tall roof and its exit; metres=${meters}`);
    } finally {f.world.free();}
  }
});
