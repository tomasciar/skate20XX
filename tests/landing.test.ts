import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createBoardPlayer } from '../src/player/board.ts';
import { createTrickSystem } from '../src/player/tricks/tricks.ts';
import { judgeLanding, LANDING } from '../src/player/movement/landing.ts';
import {AIR_YAW_SPEED} from '../src/player/movement/airRotation.ts';
import type { PlayerIntent } from '../src/player/controller.ts';
import type { RampWorld } from '../src/world/ramp.ts';

const dt=1/120,deg=Math.PI/180;
const idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
  wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};

test('a straight landing absorbs more the faster it rolls; a crooked one only gets the base limit',()=>{
  assert.equal(judgeLanding(10,0,0).limit,LANDING.hardImpact);
  assert.equal(judgeLanding(10,90,90*deg).limit,LANDING.hardImpact);
  assert.equal(judgeLanding(10,90,LANDING.loose).limit,LANDING.hardImpact);
  assert.ok(judgeLanding(10,90,0).limit>40);
  assert.equal(judgeLanding(10,90,LANDING.clean).limit,judgeLanding(10,90,0).limit);
  let previous=Infinity;
  for(let angle=0;angle<=60;angle+=5) {
    const limit=judgeLanding(10,90,angle*deg).limit;
    assert.ok(limit<=previous && limit>=LANDING.hardImpact);previous=limit;
  }
});

test('landings are graded by alignment and only real touchdowns earn a boost',()=>{
  assert.deepEqual([judgeLanding(10,30,2*deg).grade,judgeLanding(10,30,10*deg).grade,judgeLanding(10,30,30*deg).grade],
    ['Perfect','Clean',null]);
  assert.equal(judgeLanding(2,30,0).grade,null);assert.equal(judgeLanding(2,30,0).boost,0);
  assert.ok(judgeLanding(10,30,2*deg).boost>judgeLanding(10,30,10*deg).boost);
  assert.equal(judgeLanding(10,30,30*deg).boost,0);
  assert.equal(judgeLanding(100,300,0).boost,LANDING.maxBoost);
});

async function drop(forwardSpeed:number,impact:number,yawDegrees=0) {
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  const ground=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-0.1,0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(50,0.1,5000),ground);
  const anchor=new THREE.Vector3(),spawn=new THREE.Vector3(0,0.02,0);
  const ramp:RampWorld={mesh:new THREE.Group(),spawn,anchor,surfaceOrigin:anchor,endZ:-99999,
    surfaceNormal:new THREE.Vector3(0,1,0),forward:new THREE.Vector3(0,0,-1),distance:0,grindRails:[],
    scroll:()=>new THREE.Vector3(),reset:()=>{},prepareNextChunk:()=>true,flushDeferredDestroy:()=>{}};
  const player=createBoardPlayer(new THREE.Scene(),world,ramp),tricks=createTrickSystem();
  const messages=new Set<string>();
  const tick=(intent:PlayerIntent=idle)=>{
    player.update(dt,intent,tricks.state);if(tricks.state.bail)tricks.clearBail();
    if(!player.crashed)tricks.update(dt,player.grounded,1,player.speed);
    if(tricks.state.message)messages.add(tricks.state.message);
    world.step();player.sync(false);
  };
  const hold=(velocity:{x:number;y:number;z:number})=>{player.body.setTranslation({x:0,y:3,z:0},true);player.body.setLinvel(velocity,true);};
  for(let i=0;i<90;i++)tick();
  // Turn the board in the air, then throw it at the road so it touches down at the requested speeds.
  hold({x:0,y:0,z:0});tick();
  for(let i=Math.round(Math.abs(yawDegrees)*deg/AIR_YAW_SPEED/dt);i>0;i--) { hold({x:0,y:0,z:0});tick({...idle,steer:Math.sign(yawDegrees)}); }
  hold({x:0,y:-Math.sqrt(Math.max(0,impact*impact-2*18*2.7)),z:-forwardSpeed});
  let landedSpeed=0;
  for(let i=0;i<240 && !player.crashed;i++) { tick();if(player.grounded && !landedSpeed)landedSpeed=player.speed; }
  const result={crashed:player.crashed,cause:player.crashed?player.crashCause:null,grounded:player.grounded,landedSpeed,messages};
  world.free();return result;
}

test('fast, straight landings ride away from touchdowns that are fatal at low speed',async()=>{
  for(const speed of [10,30])assert.equal((await drop(speed,30)).cause,'hardLanding');
  for(const speed of [90,110]) for(const impact of [25,35]) {
    const landing=await drop(speed,impact);
    assert.equal(landing.crashed,false,`${speed} m/s with a ${impact} m/s touchdown should be landable`);
    assert.equal(landing.grounded,true);assert.ok(landing.messages.has('Perfect Landing'));
  }
  // Ordinary touchdowns are landable at any speed, as before.
  for(const speed of [10,60,110])assert.equal((await drop(speed,15)).crashed,false);
  assert.equal((await drop(90,60)).cause,'hardLanding');
});

test('speed demands precision: the same heavy touchdown bails when the board is crooked',async()=>{
  assert.equal((await drop(90,30,0)).crashed,false);
  assert.equal((await drop(90,30,10)).crashed,false);
  assert.equal((await drop(90,30,60)).cause,'hardLanding');
  assert.equal((await drop(90,30,90)).cause,'hardLanding');
  // Landing switch is as good as landing regular.
  assert.equal((await drop(90,30,180)).crashed,false);
  // A gentle touchdown still slides out of a crooked landing instead of bailing.
  assert.equal((await drop(90,10,60)).crashed,false);
});

test('a well-aimed landing carries more speed than a crooked one',async()=>{
  const straight=await drop(30,10,0),crooked=await drop(30,10,30);
  assert.ok(straight.landedSpeed>30.5,`expected a boost, got ${straight.landedSpeed}`);
  assert.ok(crooked.landedSpeed<30);
  assert.equal(straight.messages.has('Perfect Landing'),false,'small landings are not called out');
});
