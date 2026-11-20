import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {createInput} from '../src/input.ts';
import {createController} from '../src/player/controller.ts';
import {createNitro,nitroHeading,NITRO} from '../src/player/movement/nitro.ts';
import {createBoardPlayer} from '../src/player/board.ts';
import {createTrickSystem} from '../src/player/tricks/tricks.ts';
import type {PlayerIntent} from '../src/player/controller.ts';
import type {RampWorld} from '../src/world/ramp.ts';
import {GRIND_HEIGHT} from '../src/player/dimensions.ts';
import {createParticles} from '../src/render/particles.ts';
import {createNitroEffects} from '../src/render/nitroEffects.ts';

const dt=1/120,idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};

test('R activates nitro with either Shift key held; Tab restarts and browser shortcuts remain native',()=>{
  const previousWindow=globalThis.window,events=new EventTarget();Object.assign(globalThis,{window:events});
  const input=createInput(),controller=createController();
  function key(type:string,code:string,props:Record<string,unknown>={}) {
    const event=Object.assign(new Event(type,{cancelable:true}),{code,repeat:false,...props});events.dispatchEvent(event);return event;
  }
  try {
    for(const shift of ['ShiftLeft','ShiftRight']) {
      key('keydown',shift);key('keydown','KeyR');key('keyup',shift);input.beginFrame();input.beginFrame();
      const intent=controller.update(input.state,dt);assert.equal(intent.wantNitro,true);assert.equal(intent.reset,false);
      input.consume();assert.equal(controller.update(input.state,dt).wantNitro,false);
      key('keydown','KeyR',{repeat:true});assert.equal(controller.update(input.state,dt).wantNitro,false,'holding R must not repeatedly activate');
      key('keyup','KeyR');key('keyup',shift);
    }
    key('keydown','KeyR');const regular=controller.update(input.state,dt);
    assert.equal(regular.wantNitro,true);
    const tab=key('keydown','Tab');assert.equal(tab.defaultPrevented,true);
    const restart=controller.update(input.state,dt);assert.equal(restart.reset,true);assert.equal(restart.wantNitro,false);
    key('keydown','KeyR',{ctrlKey:true});assert.equal(input.state.nitro,false);
    key('keydown','KeyR',{metaKey:true});assert.equal(input.state.nitro,false);
    key('keydown','KeyR');events.dispatchEvent(new Event('blur'));assert.equal(input.state.nitro,false);
  } finally {input.dispose();if(previousWindow)globalThis.window=previousWindow;else delete (globalThis as Record<string,unknown>).window;}
});

test('nitro has a finite duration, cannot stack, and becomes ready after its recharge',()=>{
  const nitro=createNitro();let added=nitro.step(.5,true);
  assert.equal(nitro.state.active,true);assert.equal(nitro.state.remaining,1.5);
  added+=nitro.step(.5,true);assert.equal(nitro.state.remaining,1,'pressing again must not extend the boost');
  added+=nitro.step(2,false);assert.equal(nitro.state.active,false);
  assert.ok(Math.abs(added-NITRO.acceleration*NITRO.duration)<1e-8,'long frames may only apply the remaining powered time');
  assert.equal(nitro.step(.5,true),0);nitro.step(5,false);assert.equal(nitro.state.cooldown,0);
  assert.ok(nitro.step(dt,true)>0);nitro.cancel();assert.equal(nitro.state.active,false);assert.ok(nitro.state.cooldown>0);
  nitro.reset();assert.deepEqual(nitro.state,{active:false,remaining:0,cooldown:0});
});

test('nitro delivers the same speed increase at different simulation steps',()=>{
  function run(step:number){const n=createNitro();let gain=0;for(let i=0;i<Math.round(3/step);i++)gain+=n.step(step,i===0);return gain;}
  assert.ok(Math.abs(run(1/30)-run(1/120))<1e-8);
});

async function fixture(mode:'skate'|'snowboard',air=false) {
  await RAPIER.init();const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  const floor=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-.1,0));world.createCollider(RAPIER.ColliderDesc.cuboid(100,.1,1000),floor);
  const anchor=new THREE.Vector3(),ramp:RampWorld={mesh:new THREE.Group(),spawn:new THREE.Vector3(0,.02,0),anchor,surfaceOrigin:anchor,surfaceNormal:new THREE.Vector3(0,1,0),forward:new THREE.Vector3(0,0,-1),distance:0,endZ:-99999,grindRails:[],scroll:()=>new THREE.Vector3(),reset:()=>{},prepareNextChunk:()=>true,flushDeferredDestroy:()=>{}};
  const player=createBoardPlayer(new THREE.Scene(),world,ramp,mode),tricks=createTrickSystem();
  function tick(intent=idle){player.update(dt,intent,tricks.state);world.step();player.sync(false);}
  for(let i=0;i<60;i++)tick();if(air)player.body.setTranslation({x:0,y:60,z:0},true);
  player.body.setLinvel({x:0,y:air?-2:0,z:-20},true);
  return {world,player,tricks,tick,ramp};
}

for(const mode of ['skate','snowboard'] as const)test(`${mode}: nitro accelerates the real rider without restarting, and restart refills it`,async()=>{
  const boosted=await fixture(mode),control=await fixture(mode);
  try {
    const resets=boosted.player.resetCount;
    for(let i=0;i<120;i++){boosted.tick({...idle,wantNitro:i===0});control.tick();assert.equal(boosted.player.crashed,false);}
    assert.ok(boosted.player.speed>control.player.speed+20,'stronger boost should produce a substantial physical speed increase');
    assert.equal(boosted.player.resetCount,resets);assert.ok(boosted.player.nitro.active);
    boosted.tick({...idle,reset:true,wantNitro:true});assert.equal(boosted.player.resetCount,resets+1);
    assert.deepEqual(boosted.player.nitro,{active:false,remaining:0,cooldown:0});
  } finally {boosted.world.free();control.world.free();}
});

test('airborne nitro stays downhill during flips and preserves the gravity trajectory',async()=>{
  const boosted=await fixture('skate',true),control=await fixture('skate',true);
  try {
    for(let i=0;i<35;i++) {
      const spin={...idle,toggleAirFlip:i===2,push:i>=2?1:0,steer:0};
      boosted.tick({...spin,wantNitro:i===0});control.tick(spin);
      assert.equal(boosted.player.crashed,false);
    }
    assert.ok(boosted.player.velocity.z<control.player.velocity.z-2);
    assert.ok(Math.abs(boosted.player.velocity.y-control.player.velocity.y)<.03,'boost must not replace gravity with board-facing thrust');
    assert.equal(boosted.player.aerial.active,true);
  } finally {boosted.world.free();control.world.free();}
});

test('nitro accelerates along an active grind rather than pulling the rider off the rail',async()=>{
  const boosted=await fixture('skate'),control=await fixture('skate');
  try {
    for(const rider of [boosted,control]) {
      rider.ramp.grindRails.push({id:'nitro-rail',start:new THREE.Vector3(0,1,0),end:new THREE.Vector3(0,1,-100)});
      rider.player.body.setTranslation({x:0,y:1+GRIND_HEIGHT+.05,z:-3},true);
      rider.player.body.setLinvel({x:0,y:-1,z:-15},true);
      rider.tick();assert.equal(rider.player.grind.active,true);
    }
    for(let i=0;i<60;i++){boosted.tick({...idle,wantNitro:i===0});control.tick();}
    assert.equal(boosted.player.grind.active,true);
    assert.ok(boosted.player.velocity.z<control.player.velocity.z-3);
    assert.ok(Math.abs(boosted.player.velocity.x)<.01);
  } finally {boosted.world.free();control.world.free();}
});

test('airborne nitro uses the downhill tail when the nose faces uphill, even at zero travel speed',async()=>{
  const rider=await fixture('skate',true);
  try {
    rider.tick();
    rider.player.body.setLinvel({x:0,y:-2,z:0},true);
    rider.player.body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI),true);
    rider.tick({...idle,wantNitro:true});
    assert.ok(rider.player.velocity.z<0,'a spin must not reverse the boost');
  } finally {rider.world.free();}
});

test('nitro follows the board axis toward downhill in either stance and on curved or banked sections',()=>{
  const out=new THREE.Vector3();
  for(const normal of [new THREE.Vector3(0,1,0),new THREE.Vector3(.3,1,.2).normalize()]) {
    for(const course of [new THREE.Vector3(0,0,-1),new THREE.Vector3(1,0,.2).normalize()]) {
      const downhill=course.clone().addScaledVector(normal,-course.dot(normal)).normalize();
      for(let i=0;i<32;i++) {
        const forward=downhill.clone().applyAxisAngle(normal,i*Math.PI/16);
        nitroHeading(forward,downhill,normal,out);
        assert.ok(out.dot(downhill)>=-1e-10,'thrust must never point back up the local course');
        assert.ok(Math.abs(out.dot(forward))>1-1e-10,'thrust must follow either the nose or the tail');
        assert.ok(Math.abs(out.dot(normal))<1e-10);
      }
      nitroHeading(normal,downhill,normal,out);
      assert.ok(out.distanceTo(downhill)<1e-10,'a vertical board falls back to downhill');
    }
  }
});

for(const mode of ['skate','snowboard'] as const)test(`${mode}: nitro opposes uphill rolling instead of boosting backward or launching`,async()=>{
  const boosted=await fixture(mode),control=await fixture(mode);
  try {
    for(const rider of [boosted,control])rider.player.body.setLinvel({x:0,y:0,z:20},true);
    for(let i=0;i<60;i++){boosted.tick({...idle,wantNitro:i===0});control.tick();}
    assert.ok(boosted.player.velocity.z<control.player.velocity.z-10);
    assert.equal(boosted.player.grounded,true);assert.equal(boosted.player.crashed,false);
    assert.ok(Math.abs(boosted.player.position.y-control.player.position.y)<.1);
  } finally {boosted.world.free();control.world.free();}
});

test('airborne nitro follows an angled board rather than uphill momentum, in both stances',async()=>{
  for(const yaw of [Math.PI/4,Math.PI*1.25]) {
    const boosted=await fixture('skate',true),control=await fixture('skate',true);
    try {
      for(const rider of [boosted,control]) {
        rider.tick();
        rider.player.body.setLinvel({x:20,y:-2,z:15},true);
        rider.player.body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),true);
      }
      boosted.tick({...idle,wantNitro:true});control.tick();
      const thrust=boosted.player.velocity.clone().sub(control.player.velocity);
      assert.ok(thrust.dot(new THREE.Vector3(-1,0,-1).normalize())>NITRO.acceleration*dt*.95);
      assert.ok(thrust.z<0);assert.ok(Math.abs(thrust.y)<.002);
    } finally {boosted.world.free();control.world.free();}
  }
});

test('nitro slows an uphill grind instead of accelerating it farther backward',async()=>{
  const boosted=await fixture('skate'),control=await fixture('skate');
  try {
    for(const rider of [boosted,control]) {
      rider.ramp.grindRails.push({id:'nitro-rail',start:new THREE.Vector3(0,1,0),end:new THREE.Vector3(0,1,-100)});
      rider.player.body.setTranslation({x:0,y:1+GRIND_HEIGHT+.05,z:-40},true);
      rider.player.body.setLinvel({x:0,y:-1,z:15},true);
      rider.tick();assert.equal(rider.player.grind.active,true);
    }
    for(let i=0;i<30;i++){boosted.tick({...idle,wantNitro:i===0});control.tick();}
    assert.equal(boosted.player.grind.active,true);
    assert.ok(boosted.player.velocity.z<control.player.velocity.z-5);
  } finally {boosted.world.free();control.world.free();}
});

test('nitro visuals emit into a bounded pool, fade out, and stop on crash or reset',()=>{
  const particles=createParticles(128),effects=createNitroEffects(particles);
  const state={active:true,remaining:2,cooldown:8};
  const at=new THREE.Vector3(0,1,0),velocity=new THREE.Vector3(0,0,-80),up=new THREE.Vector3(0,1,0),forward=new THREE.Vector3(0,0,-1);
  for(let i=0;i<60;i++){effects.update(1/60,state,at,velocity,up,forward,forward);particles.update(1/60,800,62);}
  assert.ok(effects.strength>.99);assert.ok(particles.live>0 && particles.live<=128);
  const colors=particles.points.geometry.getAttribute('color');
  assert.ok(colors.getZ(0)>colors.getX(0),'regular nitro has a cyan wake');
  for(let i=0;i<120;i++){effects.update(1/60,state,at,velocity,up,forward,forward,true);particles.update(1/60,800,62);}
  assert.equal(effects.strength,0);assert.equal(particles.live,0);
  effects.update(.05,state,at,velocity,up,forward,forward);particles.update(.01,800,62);
  assert.ok(particles.live>0);effects.reset();assert.equal(effects.strength,0);
  particles.points.geometry.dispose();particles.points.material.dispose();
});
