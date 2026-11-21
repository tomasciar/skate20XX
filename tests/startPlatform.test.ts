import {planChunk} from '../src/world/planning/generation.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {createRamp,RAMP} from '../src/world/ramp.ts';
import {START_PLATFORM,START_BOOST,makeStartPlatform} from '../src/world/structures/startPlatform.ts';
import {createBoardPlayer} from '../src/player/board.ts';
import {createTrickSystem} from '../src/player/tricks/tricks.ts';
import {createChaseCamera} from '../src/camera/chase.ts';
import {BOARD} from '../src/player/dimensions.ts';
import type {PlayerIntent} from '../src/player/controller.ts';

const context=new Proxy({},{get:()=>()=>{}});
Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>context})}});
const dt=1/120;
const idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
  wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};

async function fixture() {
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  const scene=new THREE.Scene(),ramp=createRamp(scene,world),player=createBoardPlayer(scene,world,ramp),tricks=createTrickSystem();
  const tick=(intent:PlayerIntent=idle)=>{
    player.update(dt,intent,tricks.state);tricks.update(dt,player.grounded||player.grind.active,player.uprightDot,player.speed);
    world.step();player.sync();
  };
  world.step();scene.updateMatrixWorld(true);
  return {world,scene,ramp,player,tick};
}

test('the start platform is 17 m above the road, matches collision, and supports the visible wheels and camera',async()=>{
  const f=await fixture();
  try {
    const surface=f.ramp.spawn.clone().addScaledVector(f.ramp.surfaceNormal,-0.02);
    const down=new THREE.Vector3(0,-1,0),below=surface.clone().add(down);
    const road=f.world.castRay(new RAPIER.Ray(below,down),20,true,undefined,undefined,undefined,f.player.body);
    assert.ok(road);assert.ok(Math.abs(road.timeOfImpact+1-START_PLATFORM.height)<0.002);
    const origin=surface.clone().addScaledVector(f.ramp.surfaceNormal,2),direction=f.ramp.surfaceNormal.clone().negate();
    const physical=f.world.castRay(new RAPIER.Ray(origin,direction),3,true,undefined,undefined,undefined,f.player.body);
    const visual=new THREE.Raycaster(origin,direction,0,3).intersectObject(f.ramp.mesh,true)[0];
    assert.ok(physical && visual);assert.ok(Math.abs(physical.timeOfImpact-visual.distance)<0.002);
    for(let i=0;i<90;i++)f.tick();
    assert.equal(f.player.grounded,true);assert.equal(f.player.canOllie,true);
    assert.ok(f.player.position.clone().sub(f.ramp.anchor).dot(f.ramp.surfaceNormal)>16);
    const up=new THREE.Vector3(0,1,0).applyQuaternion(f.player.mesh.quaternion);
    for(const z of [-BOARD.truckZ,BOARD.truckZ])for(const x of [-BOARD.wheelX,BOARD.wheelX]) {
      const wheel=f.player.mesh.localToWorld(new THREE.Vector3(x,BOARD.wheelY,z));
      const hit=f.world.castRay(new RAPIER.Ray(wheel.clone().addScaledVector(up,0.1),up.clone().negate()),0.3,true,undefined,undefined,undefined,f.player.body);
      assert.ok(hit);assert.ok(Math.abs(hit.timeOfImpact-0.1-BOARD.wheelRadius)<0.002);
    }
    const camera=new THREE.PerspectiveCamera(),chase=createChaseCamera(camera,f.ramp.forward);
    chase.snap(f.player.position);assert.ok(camera.position.y>f.player.position.y+5);
  } finally {f.world.free();}
});

test('rolling or ollieing off the platform lands on the hill and keeps the downhill run going',async()=>{
  for(const launch of ['coast','push','ollie']) {
    const f=await fixture();
    try {
      const resets=f.player.resetCount;
      let airborne=false,landed=false,popped=false;
      for(let i=0;i<900;i++) {
        const along=f.player.position.clone().sub(f.ramp.anchor).dot(f.ramp.forward);
        const pop=launch==='ollie' && !popped && along>START_PLATFORM.front-2 && f.player.grounded;
        if(pop)popped=true;
        f.tick({...idle,push:launch==='coast'?0:1,wantOllie:pop,olliePower:1});
        assert.equal(f.player.crashed,false,`${launch}: intro drop crashed at frame ${i}, speed ${f.player.speed}`);
        assert.equal(f.player.resetCount,resets,'the intro must not reset or teleport the player');
        if(i>20 && !f.player.grounded)airborne=true;
        const roadHeight=f.player.position.clone().sub(f.ramp.anchor).dot(f.ramp.surfaceNormal);
        if(airborne && f.player.grounded && roadHeight<1) {landed=true;break;}
      }
      assert.ok(airborne && landed,`${launch}: should drop and touch down on the road`);
      assert.equal(f.player.ollieCount,launch==='ollie'?1:0);
      assert.ok(f.player.velocity.dot(f.ramp.forward)>5,'landing must retain downhill momentum');
      const chunks=f.ramp.mesh.children;
      const coneColliders=chunks.reduce((count,chunk)=>{
        const index=Math.round(f.ramp.distance/RAMP.chunkLength-chunk.position.z/RAMP.chunkLength);
        return count+planChunk(index).encounters.filter(item=>item.kind==='cones').length*3;
      },0);
      assert.equal(f.world.colliders.len(),chunks.length+coneColliders+2+1,'one terrain collider per chunk, planned cones, two court cars, and the player');
      if(launch==='ollie') {
        // A second 14 m drop would fit the intro's allowance, but must use normal crash rules.
        f.player.body.setTranslation(f.ramp.anchor.clone().addScaledVector(f.ramp.forward,40).addScaledVector(f.ramp.surfaceNormal,14),true);
        f.player.body.setLinvel({x:0,y:0,z:0},true);
        for(let i=0;i<300 && !f.player.crashed;i++)f.tick();
        assert.equal(f.player.crashed,true,'intro landing allowance must be consumed at the first road touchdown');
      }
    } finally {f.world.free();}
  }
});

test('reset after streaming restores the floating start and its collision without duplicate bodies',async()=>{
  const f=await fixture();
  try {
    const spawn=f.ramp.spawn.clone();
    f.ramp.scroll(350);f.player.reset(f.ramp.spawn);f.world.step();
    assert.equal(f.ramp.distance,0);assert.ok(f.ramp.spawn.distanceTo(spawn)<1e-8);
    for(let i=0;i<60;i++)f.tick();
    assert.equal(f.player.grounded,true);assert.equal(f.player.crashed,false);
    assert.ok(f.player.position.clone().sub(f.ramp.anchor).dot(f.ramp.surfaceNormal)>16);
    assert.equal(f.world.colliders.len(),RAMP.chunksBehind+1+RAMP.chunksAhead+2+1); // Two court cars and one player collider.
  } finally {f.world.free();}
});

test('solid platform arrows point toward the open downhill end',()=>{
  const platform=makeStartPlatform();
  const markings=platform.children.filter(mesh=>mesh instanceof THREE.Mesh && mesh.geometry.type==='ShapeGeometry') as THREE.Mesh[];
  assert.equal(markings.length,3);
  for(const marking of markings) {
    const points=marking.geometry.getAttribute('position');
    let front=Infinity,back=-Infinity,tipX=Infinity;
    for(let i=0;i<points.count;i++) {
      if(points.getZ(i)<front){front=points.getZ(i);tipX=points.getX(i);}
      back=Math.max(back,points.getZ(i));
    }
    assert.ok(front<0 && back>0 && Math.abs(tipX)<1e-6);
  }
});

test('side pads boost on contact once per entry, keep existing faster speeds, and leave the central line clear',async()=>{
  const f=await fixture();
  try {
    const roadPoint=(x:number,along=START_BOOST.along)=>f.ramp.anchor.clone().addScaledVector(f.ramp.forward,along)
      .addScaledVector(f.ramp.surfaceNormal,0.2).add(new THREE.Vector3(x,0,0));
    assert.equal(f.ramp.boostAt!(roadPoint(0)),0);
    assert.equal(f.ramp.boostAt!(roadPoint(START_BOOST.x).addScaledVector(f.ramp.surfaceNormal,5)),0);
    for(const side of [-1,1]) {
      f.player.body.setTranslation(roadPoint(side*START_BOOST.x),true);
      f.player.body.setLinvel(f.ramp.forward.clone().multiplyScalar(10),true);
      for(let i=0;i<12;i++){f.tick();if(f.player.speed>START_BOOST.speed-1)break;}
      assert.ok(f.player.speed>START_BOOST.speed-1,'either side pad should provide the testing boost');
      assert.equal(f.player.grounded,true);assert.equal(f.player.crashed,false);
      assert.ok(Math.abs(f.player.velocity.dot(f.ramp.surfaceNormal))<1,'boost must not launch the rider upwards');
      f.player.body.setLinvel(f.ramp.forward.clone().multiplyScalar(20),true);f.tick();
      assert.ok(f.player.speed<21,'remaining over a pad must not repeatedly reset speed');
      f.player.body.setTranslation(roadPoint(0),true);f.tick();
      f.player.body.setTranslation(roadPoint(side*START_BOOST.x),true);
      f.player.body.setLinvel(f.ramp.forward.clone().multiplyScalar(90),true);f.tick();
      assert.ok(f.player.speed>89,'boost pads must not cap an already faster rider');
      f.player.body.setTranslation(roadPoint(0),true);f.tick();
    }
    f.ramp.scroll(350);f.world.step();
    assert.equal(f.ramp.boostAt!(roadPoint(START_BOOST.x)),0,'the starting pads must not repeat after streaming');
  } finally {f.world.free();}
});
