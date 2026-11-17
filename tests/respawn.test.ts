import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {createRamp,RAMP} from '../src/world/ramp.ts';
import {createBoardPlayer} from '../src/player/board.ts';
import {createTrickSystem} from '../src/player/tricks/tricks.ts';

const context=new Proxy({},{get:()=>()=>{}});
Object.assign(globalThis,{document:{createElement:()=>({width:0,height:0,getContext:()=>context})}});
const dt=1/120;
const idle={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
  wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};

for(const mode of ['skate','snowboard'] as const) {
  test(`${mode}: crash recovery retains the crash site across streaming, clears the ragdoll, and R restarts`,async()=>{
    await RAPIER.init();
    const scene=new THREE.Scene(),world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
    const ramp=createRamp(scene,world,{mode}),player=createBoardPlayer(scene,world,ramp,mode),tricks=createTrickSystem();
    const progress=()=>ramp.distance+player.position.clone().sub(ramp.anchor).dot(ramp.forward);
    const tick=()=>{player.update(dt,idle,tricks.state);tricks.clearBail();world.step();player.sync();};
    try {
      // Teleport ahead to a curved/graded section, then crash just across a chunk boundary.
      ramp.scroll(8*RAMP.chunkLength);
      const at=ramp.anchor.clone().addScaledVector(ramp.forward,RAMP.chunkLength+5);
      ramp.recoveryAt!(at,at);at.x+=6;at.addScaledVector(ramp.surfaceNormal,.25);
      player.body.setTranslation(at,true);player.body.setLinvel(ramp.forward.clone().multiplyScalar(85),true);
      tricks.state.bail=true;
      player.update(dt,idle,tricks.state);tricks.clearBail();
      assert.equal(player.crashed,true);
      player.sync();
      const deathProgress=8*RAMP.chunkLength+RAMP.chunkLength+5;
      const courseDistance=ramp.distance,resetCount=player.resetCount;
      assert.equal(courseDistance,9*RAMP.chunkLength,'crash-site rebase should happen once');
      let furthest=progress();
      for(let i=0;i<400 && player.crashed;i++) {tick();furthest=Math.max(furthest,progress());}
      assert.equal(player.crashed,false);assert.equal(player.resetCount,resetCount+1);
      assert.ok(furthest>deathProgress+30,'ragdoll should actually tumble beyond the crash site');
      assert.equal(ramp.distance,courseDistance,'ragdoll must not stream away the recovery location');
      assert.ok(Math.abs(progress()-deathProgress)<.05,`respawn moved from ${deathProgress} to ${progress()}`);
      assert.ok(Math.abs(ramp.roadOffset!(player.position))<.01,'recover in the clear center lane');
      assert.equal(world.impulseJoints.len(),0);assert.ok(player.speed<1);
      const floor=ramp.recoveryAt!(player.position,new THREE.Vector3());
      assert.ok(player.position.clone().sub(floor).dot(ramp.surfaceNormal)<.3,'recover on road, not floating platform');
      for(let i=0;i<60;i++)tick();
      assert.equal(player.crashed,false,'recovery must remain rideable');
      tricks.state.bail=true;player.update(dt,idle,tricks.state);
      assert.equal(player.crashed,true);
      player.update(dt,{...idle,reset:true},tricks.state);
      assert.equal(player.crashed,false);assert.equal(ramp.distance,0);assert.equal(world.impulseJoints.len(),0);
      assert.ok(player.position.distanceTo(ramp.spawn.clone().addScaledVector(ramp.surfaceNormal,.22))<1e-4,'R must return to original launch platform');
    } finally {world.free();}
  });
}

test('fall recovery preserves course progress and never resets the world',async()=>{
  await RAPIER.init();
  const scene=new THREE.Scene(),world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  const ramp=createRamp(scene,world),player=createBoardPlayer(scene,world,ramp);
  try {
    ramp.scroll(25*RAMP.chunkLength);
    const at=ramp.anchor.clone().addScaledVector(ramp.forward,30).addScaledVector(ramp.surfaceNormal,-80);
    player.body.setTranslation(at,true);player.sync();
    const distance=ramp.distance,count=player.resetCount;
    player.respawn();
    assert.equal(ramp.distance,distance);assert.equal(player.resetCount,count+1);
    assert.ok(Math.abs(player.position.clone().sub(ramp.anchor).dot(ramp.forward)-30)<.001);
    assert.ok(Math.abs(ramp.roadOffset!(player.position))<.001);
    const floor=ramp.recoveryAt!(player.position,new THREE.Vector3());
    assert.ok(Math.abs(player.position.clone().sub(floor).dot(ramp.surfaceNormal)-.22)<.001);
    world.step();
    const ray=new RAPIER.Ray(floor.clone().addScaledVector(ramp.surfaceNormal,1),ramp.surfaceNormal.clone().negate());
    const hit=world.castRay(ray,2,true,undefined,undefined,undefined,player.body);
    assert.ok(hit && Math.abs(hit.timeOfImpact-1)<.01,`recovery height must match actual steep-road collision (ray: ${hit?.timeOfImpact})`);
  } finally {world.free();}
});
