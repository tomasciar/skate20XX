import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createSlide, SLIDE } from '../src/player/slide.ts';
import { createBoardPlayer } from '../src/player/board.ts';
import { createTrickSystem } from '../src/player/tricks.ts';
import { createSkaterVisual } from '../src/player/skaterVisual.ts';
import { BOARD, RIDER } from '../src/player/dimensions.ts';
import type { PlayerIntent } from '../src/player/controller.ts';
import type { RampWorld } from '../src/world/ramp.ts';

const dt=1/120,up=new THREE.Vector3(0,1,0);
const idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
  wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};

test('slides turn sideways and accept either exit stance shortly after S is released',()=>{
  for(const course of [-2.4,0,2.8]) for(const start of [0,Math.PI]) for(const steer of [-1,1]) {
    const slide=createSlide();let yaw=course+start;
    for(let i=0;i<60;i++)yaw=slide.update(dt,true,0,yaw,course,30,true);
    assert.ok(slide.state.amount>0.99);
    assert.ok(Math.abs(Math.cos(yaw-course))<0.01);
    for(let i=0;i<12;i++)yaw=slide.update(dt,false,0,yaw,course,30,true);
    assert.equal(slide.state.choosing,true);
    yaw=slide.update(dt,false,steer,yaw,course,30,true);
    for(let i=0;i<80;i++)yaw=slide.update(dt,false,0,yaw,course,30,true);
    assert.equal(slide.state.active,false);
    assert.ok(Math.cos(yaw-course)*steer>0.999,'D must exit regular, A switch, independent of starting stance');
  }
});

test('without an exit choice the slide returns to the original stance; late steering remains normal carving',()=>{
  for(const start of [0,Math.PI]) {
    const slide=createSlide();let yaw=start;
    for(let i=0;i<60;i++)yaw=slide.update(dt,true,0,yaw,0,25,true);
    for(let i=0;i<Math.ceil(SLIDE.exitWindow/dt)+100;i++)yaw=slide.update(dt,false,0,yaw,0,25,true);
    assert.ok(Math.cos(yaw-start)>0.999);assert.equal(slide.state.active,false);
    assert.equal(slide.update(dt,false,1,yaw,0,25,true),yaw,'idle slides must leave steering to the trucks');
  }
});

test('slides cannot start in air or from rest, and clear on lost support and reset',()=>{
  const slide=createSlide();
  slide.update(dt,true,0,0,0,30,false);assert.equal(slide.state.active,false);
  slide.update(dt,true,0,0,0,0,true);assert.equal(slide.state.active,false);
  slide.update(dt,true,0,0,0,30,true);assert.equal(slide.state.active,true);
  slide.update(dt,true,1,0,0,30,false);assert.equal(slide.state.active,false);assert.equal(slide.state.amount,0);
  slide.update(dt,true,0,0,0,30,true);slide.reset();assert.equal(slide.state.active,false);
});

async function fixture(pitch=0) {
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),pitch);
  const normal=up.clone().applyQuaternion(rotation);
  const ground=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-0.1*normal.y,-0.1*normal.z).setRotation(rotation));
  world.createCollider(RAPIER.ColliderDesc.cuboid(240,0.1,5000),ground);
  const anchor=new THREE.Vector3(),spawn=new THREE.Vector3(0,0.02,0);
  const ramp:RampWorld={mesh:new THREE.Group(),spawn,anchor,surfaceOrigin:anchor,endZ:-99999,
    surfaceNormal:up.clone(),forward:new THREE.Vector3(0,0,-1),distance:0,grindRails:[],
    scroll:()=>new THREE.Vector3(),reset:()=>{},prepareNextChunk:()=>true,flushDeferredDestroy:()=>{}};
  const player=createBoardPlayer(new THREE.Scene(),world,ramp),tricks=createTrickSystem();
  const tick=(intent:PlayerIntent=idle)=>{
    player.update(dt,intent,tricks.state);tricks.update(dt,player.grounded||player.grind.active,player.uprightDot,player.speed);
    world.step();player.sync();
  };
  for(let i=0;i<70;i++)tick();
  return {world,player,tick,normal,tricks};
}

test('a physical slide scrubs speed without redirecting momentum or losing wheel contact',async()=>{
  for(const pitch of [0,0.08]) for(const speed of [15,45,85]) {
    const f=await fixture(pitch);
    try {
      const direction=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(1,0,0),pitch);
      f.player.body.setLinvel(direction.clone().multiplyScalar(speed),true);
      for(let i=0;i<55;i++) {
        f.tick({...idle,push:-1});
        assert.equal(f.player.grounded,true);assert.equal(f.player.crashed,false);
        assert.ok(Math.abs(f.player.velocity.x)<0.1,'a slide must not turn existing momentum toward a verge');
      }
      assert.ok(f.player.slide.amount>0.98);
      assert.ok(Math.abs(f.player.forward.dot(direction))<0.02,'deck must actually turn sideways');
      assert.ok(f.player.speed<speed-4,'sideways wheels must scrub speed');
      assert.equal(f.player.ollieCount,0);
    } finally {f.world.free();}
  }
});

test('facing left, slide, release S then D faces right; the opposite flow exits facing left',async()=>{
  for(const steer of [-1,1]) {
    const f=await fixture();
    try {
      if(steer>0) {
        f.player.reset(new THREE.Vector3(0,6,0));f.player.body.setLinvel({x:0,y:0,z:-25},true);
        for(let i=0;i<400 && !(f.player.grounded && i>60);i++)f.tick({...idle,steer:f.player.forward.z<0.995?1:0});
        assert.ok(f.player.forward.z>0.98,'start facing left, in switch');
      }
      f.player.body.setLinvel({x:0,y:0,z:-30},true);
      for(let i=0;i<50;i++)f.tick({...idle,push:-1});
      for(let i=0;i<10;i++)f.tick(); // A human delay between release and the next key press.
      assert.equal(f.player.slide.choosing,true);
      f.tick({...idle,steer});
      for(let i=0;i<80;i++)f.tick();
      const chest=new THREE.Vector3(1,0,0).applyQuaternion(f.player.mesh.quaternion);
      assert.ok(chest.x*steer>0.98,'rider must face the requested screen side');
      assert.equal(f.player.slide.active,false);assert.equal(f.player.crashed,false);
      assert.ok(f.player.velocity.z<-5,'exit must keep moving downhill');
      assert.ok(Math.abs(f.player.velocity.x)<0.4,'changing stance should not throw the rider across the road');
    } finally {f.world.free();}
  }
});

test('a stopped slide cannot launch backwards, and an ollie cleanly cancels a slide',async()=>{
  const f=await fixture();
  try {
    f.player.body.setLinvel({x:0,y:0,z:-8},true);
    for(let i=0;i<250;i++)f.tick({...idle,push:-1});
    assert.ok(f.player.speed<0.1);assert.ok(f.player.velocity.z<=0.001);
    f.tick({...idle,push:-1,wantOllie:true,olliePower:0.5});
    assert.equal(f.player.ollieCount,1);assert.equal(f.player.slide.active,false);
    assert.equal(f.player.grounded,false);assert.ok(f.player.velocity.y>5);
    f.tick({...idle,push:-1,toggleAirFlip:true});assert.equal(f.player.aerial.active,true);
    assert.equal(f.player.slide.active,false,'S in aerial flip mode must still control flips');
    f.player.reset(new THREE.Vector3(0,0.02,0));assert.equal(f.player.slide.active,false);
  } finally {f.world.free();}
});

test('the lower slide stance keeps both feet and knees connected to a level deck',()=>{
  const visual=createSkaterVisual();
  const base={dt,speed:35,push:-1,verticalSpeed:0,grinding:false,crouch:0,lean:0,airborne:false,bail:false,
    wheelRoll:0,boardSpin:{x:0,y:0,z:0}};
  for(const slide of [-1,1]) {
    for(let i=0;i<120;i++)visual.setPose({...base,slide});
    visual.root.updateMatrixWorld(true);
    const chest=visual.root.getObjectByName('chest')!.getWorldPosition(new THREE.Vector3());
    assert.ok(chest.y<0.85,'slide should lower the rider');
    for(const side of [-1,1]) {
      const foot=visual.root.getObjectByName(`foot-${side}`)!,shin=visual.root.getObjectByName(`shin-${side}`)!;
      const sole=visual.deck.worldToLocal(foot.localToWorld(new THREE.Vector3(0,BOARD.soleBottom,0)));
      assert.ok(Math.abs(sole.y-BOARD.gripY)<1e-7);
      assert.ok(shin.localToWorld(new THREE.Vector3(0,0.5,0)).distanceTo(foot.localToWorld(new THREE.Vector3(0,0.06,0)))<1e-4);
      assert.ok(Math.abs(shin.scale.y-RIDER.lowerLeg)<1e-4);
    }
    assert.equal(visual.board.position.length(),0);
  }
});
