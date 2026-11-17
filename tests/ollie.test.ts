import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createBoardPlayer } from '../src/player/board.ts';
import { createController, type PlayerIntent } from '../src/player/controller.ts';
import { createTrickSystem } from '../src/player/tricks/tricks.ts';
import { BOARD } from '../src/player/dimensions.ts';
import type { InputState } from '../src/input.ts';
import type { RampWorld } from '../src/world/ramp.ts';

const dt=1/120;
const idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
  wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};
const pop={...idle,wantOllie:true,olliePower:0.5};

async function fixture(pitch=0) {
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),pitch);
  const normal=new THREE.Vector3(0,1,0).applyQuaternion(rotation);
  const ground=world.createRigidBody(RAPIER.RigidBodyDesc.fixed()
    .setTranslation(-normal.x*0.1,-normal.y*0.1,-normal.z*0.1).setRotation(rotation));
  world.createCollider(RAPIER.ColliderDesc.cuboid(50,0.1,500),ground);
  const anchor=new THREE.Vector3(),spawn=new THREE.Vector3(0,0.02,0);
  const ramp:RampWorld={mesh:new THREE.Group(),spawn,anchor,surfaceOrigin:anchor,endZ:-99999,
    surfaceNormal:new THREE.Vector3(0,1,0),forward:new THREE.Vector3(0,0,-1),distance:0,grindRails:[],
    scroll:()=>new THREE.Vector3(),reset:()=>{},prepareNextChunk:()=>true,flushDeferredDestroy:()=>{}};
  const player=createBoardPlayer(new THREE.Scene(),world,ramp),tricks=createTrickSystem();
  const update=(intent:PlayerIntent=idle,seconds=dt)=>player.update(seconds,intent,tricks.state);
  const tick=(intent:PlayerIntent=idle)=>{update(intent);world.step();player.sync(false);};
  for(let i=0;i<90;i++)tick();
  assert.equal(player.grounded,true);
  // Gap beyond the uncompressed suspension's wheel contact, measured along the hill normal.
  const gap=(meters:number)=>{
    player.body.setTranslation(normal.clone().multiplyScalar(0.16+BOARD.wheelRadius+0.02+meters),true);
    player.body.setLinvel({x:0,y:0,z:0},true);
  };
  return {world,player,tricks,normal,update,tick,gap};
}

test('Space charges and pops across a small wheel gap, including uphill, without faking contact',async()=>{
  for(const pitch of [0,0.08]) {
    const f=await fixture(pitch);
    try {
      f.gap(0.025);f.update(idle,0.12); // Let coyote time expire: this must use proximity.
      assert.equal(f.player.grounded,false);
      assert.equal(f.player.canOllie,true);
      assert.equal(f.player.ollieCount,0);
      f.player.render(1,dt);
      const visibleUp=new THREE.Vector3(0,1,0).applyQuaternion(f.player.mesh.quaternion);
      assert.ok(visibleUp.dot(f.normal)>0.9999,'tiny contact gaps must keep the visible board aligned to the road');
      const controller=createController();
      const input:InputState={trickModifier:false,grabDX:0,grabDY:0,grabPress:0,push:false,brake:false,
        left:false,right:false,crouch:true,crouchPressed:true,crouchReleased:false,reset:false,
        flickDX:0,flickDY:0,flickReady:false};
      const press=controller.update(input,dt,!f.player.grounded,f.player.canOllie);
      assert.equal(press.toggleAirFlip,false);assert.equal(press.crouch,true);f.tick(press);
      input.crouch=input.crouchPressed=false;input.crouchReleased=true;
      const release=controller.update(input,dt,!f.player.grounded,f.player.canOllie);
      assert.equal(release.wantOllie,true);f.tick(release);
      assert.equal(f.player.ollieCount,1);
      assert.ok(f.player.velocity.dot(f.normal)>4.5);
      assert.equal(f.player.grounded,false);assert.equal(f.player.canOllie,false);
    } finally {f.world.free();}
  }
});

test('a brief loss of support allows a coyote ollie, but a sustained gap does not',async()=>{
  for(const elapsed of [0.05,0.12]) {
    const f=await fixture();
    try {
      f.gap(1);f.update(idle,elapsed);
      assert.equal(f.player.grounded,false);
      assert.equal(f.player.canOllie,elapsed<0.1);
      f.update(pop);
      assert.equal(f.player.ollieCount,elapsed<0.1?1:0);
    } finally {f.world.free();}
  }
});

test('a release just before support returns is buffered briefly, then expires',async()=>{
  for(const delay of [dt,0.12]) {
    const f=await fixture();
    try {
      f.gap(1);f.update(pop,0.12); // Contact disappears between input and physics.
      assert.equal(f.player.ollieCount,0);
      f.update(idle,delay);
      f.gap(0.025);f.update();
      assert.equal(f.player.ollieCount,delay<0.1?1:0);
      if(delay<0.1)assert.ok(f.player.velocity.y>5.4,'buffer must preserve the charged pop');
    } finally {f.world.free();}
  }
});

test('tolerance cannot provide a second midair ollie or block airborne flip controls',async()=>{
  const f=await fixture();
  try {
    f.tick(pop);
    for(let i=0;i<50;i++) {
      assert.equal(f.player.canOllie,false);
      f.tick(pop);
      assert.equal(f.player.ollieCount,1);
    }
    const controller=createController();
    const input:InputState={trickModifier:false,grabDX:0,grabDY:0,grabPress:0,push:false,brake:false,
      left:false,right:false,crouch:true,crouchPressed:true,crouchReleased:false,reset:false,
      flickDX:0,flickDY:0,flickReady:false};
    const intent=controller.update(input,dt,!f.player.grounded,f.player.canOllie);
    assert.equal(intent.toggleAirFlip,true);assert.equal(intent.wantOllie,false);
    f.tick(intent);assert.equal(f.player.aerial.active,true);
    f.player.reset(new THREE.Vector3(0,0.02,0));f.tick();
    assert.equal(f.player.ollieCount,0,'reset must discard any buffered request');
  } finally {f.world.free();}
});

test('Space charges and releases an ollie from either manual, including uphill, without pushing',async()=>{
  for(const pitch of [0,0.08]) for(const direction of [-1,1]) {
    const f=await fixture(pitch);
    try {
      f.tricks.setGround(0,direction,true);
      for(let i=0;i<40;i++)f.tick({...idle,push:1});
      assert.equal(f.player.pump.active,false,'both feet must stay planted during a manual');
      assert.equal(f.player.ollieCount,0);assert.equal(f.player.canOllie,true);
      const controller=createController();
      const input:InputState={trickModifier:false,grabDX:0,grabDY:0,grabPress:0,arrowDY:direction,push:false,brake:false,
        left:false,right:false,crouch:true,crouchPressed:true,crouchReleased:false,reset:false,
        flickDX:0,flickDY:0,flickReady:false};
      for(let i=0;i<30;i++) {
        const intent=controller.update(input,dt,!f.player.grounded,f.player.canOllie);
        f.tick(intent);input.crouchPressed=false;
        assert.equal(f.player.grounded,true);
      }
      input.crouch=false;input.crouchReleased=true;
      const intent=controller.update(input,dt,!f.player.grounded,f.player.canOllie);
      assert.equal(intent.wantOllie,true);f.tick(intent);
      f.tricks.update(dt,f.player.grounded,1,f.player.speed);
      assert.equal(f.player.ollieCount,1);assert.equal(f.player.grounded,false);
      assert.ok(f.player.velocity.dot(f.normal)>5);
      assert.equal(f.tricks.state.ground,null,'manual must end on takeoff');
    } finally {f.world.free();}
  }
});
