import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createAirRotation, describeAirRotation, AIR_ROTATION_SPEED, AIR_YAW_SPEED } from '../src/player/airRotation.ts';
import { createInput } from '../src/input.ts';
import { createController } from '../src/player/controller.ts';
import { createBoardPlayer } from '../src/player/board.ts';
import { createTrickSystem } from '../src/player/tricks.ts';
import { screenGrabFacing, GRABS } from '../src/player/grabs.ts';
import { BOARD, RIDER } from '../src/player/dimensions.ts';
import type { RampWorld } from '../src/world/ramp.ts';
import type { PlayerIntent } from '../src/player/controller.ts';

const dt=1/120, up=new THREE.Vector3(0,1,0);
const idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
  wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};

async function fixture(height=15) {
  await RAPIER.init();
  const scene=new THREE.Scene(),world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  const ground=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-0.1,-400));
  world.createCollider(RAPIER.ColliderDesc.cuboid(50,0.1,500),ground);
  const anchor=new THREE.Vector3(),spawn=new THREE.Vector3(0,0.02,0);
  const ramp:RampWorld={mesh:new THREE.Group(),spawn,anchor,surfaceOrigin:anchor,endZ:-99999,
    surfaceNormal:up.clone(),forward:new THREE.Vector3(0,0,-1),distance:0,grindRails:[],
    scroll:meters=>new THREE.Vector3(0,0,meters),reset:()=>{},prepareNextChunk:()=>true,flushDeferredDestroy:()=>{}};
  const player=createBoardPlayer(scene,world,ramp),tricks=createTrickSystem();
  player.reset(spawn.clone().addScaledVector(up,height));
  function tick(intent:PlayerIntent=idle) {
    tricks.setGrab(intent.grabDX,intent.grabDY,intent.grabModifier,!player.grounded&&!player.crashed,
      screenGrabFacing(player.forward,ramp.forward,up),intent.grabPress);
    if(intent.flickReady)tricks.tryFlick(intent.flickDX,intent.flickDY,!player.grounded);
    player.update(dt,intent,tricks.state);
    if(!player.crashed)tricks.update(dt,player.grounded||player.grind.active,player.uprightDot,player.speed);
    world.step();player.sync();
  }
  tick();
  return {world,player,tricks,ramp,tick};
}

test('actual left/right spins drive the chest and hips without changing horizontal spin speed',async()=>{
  for(const direction of [-1,1]) {
    const f=await fixture(100);
    try {
      // Finish the spawn/ground-to-air pose blend before comparing with settled airtime.
      for(let frame=0;frame<90;frame++)f.tick();
      const torso=f.player.mesh.getObjectByName('chest')!.parent!,hips=torso.parent!,neutral=torso.rotation.y;
      let heading=Math.atan2(-f.player.forward.x,-f.player.forward.z);
      for(let frame=0;frame<18;frame++) {
        f.tick({...idle,steer:direction});
        const next=Math.atan2(-f.player.forward.x,-f.player.forward.z);
        const difference=Math.atan2(Math.sin(next-heading),Math.cos(next-heading));
        assert.ok(Math.abs(difference+direction*AIR_YAW_SPEED*dt)<1e-5,'posing changed actual yaw control');
        heading=next;
      }
      assert.ok((torso.rotation.y-neutral)*direction<-.18,'shoulders should visibly turn into the spin');
      assert.ok(hips.rotation.y*direction<-.025,'hips should follow the rotation');
      const driving=torso.rotation.y;
      for(let frame=0;frame<12;frame++)f.tick();
      assert.ok((torso.rotation.y-driving)*direction>.15,'the body should unwind when the spin stops');
      for(let frame=0;frame<120;frame++)f.tick();
      assert.ok(Math.abs(torso.rotation.y-neutral)<.003&&Math.abs(hips.rotation.y)<.003);
    } finally {f.world.free();}
  }
});

test('spin-driven core motion changes local direction when the rider is inverted',async()=>{
  const f=await fixture(150);
  try {
    let inverted=false;
    for(let frame=0;frame<120;frame++) {
      f.tick({...idle,push:1,toggleAirFlip:frame===0});
      if(f.player.uprightDot<-.995){inverted=true;break;}
    }
    assert.ok(inverted);f.tick({...idle,toggleAirFlip:true});
    for(let frame=0;frame<90;frame++)f.tick();
    const torso=f.player.mesh.getObjectByName('chest')!.parent!,hips=torso.parent!,neutral=torso.rotation.y;
    for(let frame=0;frame<18;frame++)f.tick({...idle,steer:1});
    assert.ok(torso.rotation.y-neutral>.18,'world-right rotation should twist the inverted chest in positive local yaw');
    assert.ok(hips.rotation.y>.025,'inverted hips must follow the same actual rotation axis');
  } finally {f.world.free();}
});

test('quaternion flips pass through inversion and complete 360s on either axis and diagonally',()=>{
  for(const [pitch,roll] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1]]) {
    const air=createAirRotation();let inverted=false,complete=false;
    for(let i=0;i<240;i++) {
      air.update(dt,i===0,pitch!,roll!,true);
      const normal=up.clone().applyQuaternion(air.rotation);
      if(normal.y<-0.99)inverted=true;
      if(inverted && air.rotation.angleTo(new THREE.Quaternion())<0.03) {complete=true;break;}
      assert.ok(Math.abs(air.rotation.length()-1)<1e-10);
    }
    assert.ok(inverted && complete,`incomplete flip ${pitch},${roll}`);
  }
  const straight=createAirRotation(),diagonal=createAirRotation();
  for(let i=0;i<30;i++) {straight.update(dt,i===0,1,0,true);diagonal.update(dt,i===0,1,1,true);}
  assert.ok(Math.abs(straight.rotation.angleTo(new THREE.Quaternion())-diagonal.rotation.angleTo(new THREE.Quaternion()))<1e-8);
  assert.ok(AIR_ROTATION_SPEED>Math.PI);
});

test('changing rotation axes is continuous, mode changes preserve the pose, and support resets it',()=>{
  const air=createAirRotation();
  for(let i=0;i<50;i++)air.update(dt,i===0,1,0,true);
  for(let i=0;i<50;i++) {
    const before=air.rotation.clone();air.update(dt,false,0,-1,true);
    assert.ok(before.angleTo(air.rotation)<AIR_ROTATION_SPEED*dt+1e-8);
  }
  air.update(dt,true,0,0,true);const frozen=air.rotation.clone();
  assert.equal(air.state.active,false);
  for(let i=0;i<20;i++)air.update(dt,false,1,1,true);
  assert.ok(air.rotation.angleTo(frozen)<1e-8);
  air.update(dt,true,-1,1,true);assert.equal(air.state.active,true);
  air.update(dt,false,1,1,false);assert.equal(air.state.engaged,false);
  assert.ok(air.rotation.angleTo(new THREE.Quaternion())<1e-8);
});

test('Space presses toggle in air while ground releases ollie; holding or releasing an air press never ollies',()=>{
  const events=new EventTarget();Object.assign(globalThis,{window:events});
  const input=createInput(),controller=createController();
  const key=(type:string,code:string,repeat=false)=>events.dispatchEvent(Object.assign(new Event(type),{code,repeat}));
  const intent=(airborne:boolean)=>{input.beginFrame();const value=controller.update(input.state,dt,airborne);input.consume();return value;};
  key('keydown','Space');assert.equal(intent(false).toggleAirFlip,false);
  key('keyup','Space');assert.equal(intent(false).wantOllie,true);
  key('keydown','Space');assert.equal(intent(true).toggleAirFlip,true);
  key('keydown','Space',true);assert.equal(intent(true).toggleAirFlip,false);
  assert.equal(intent(true).crouch,false);
  // Holding the airborne toggle into the landing must not charge a second jump.
  assert.equal(intent(false).crouch,false);
  key('keyup','Space');assert.equal(intent(false).wantOllie,false);
  key('keydown','Space');assert.equal(intent(true).toggleAirFlip,true);
  key('keyup','Space');assert.equal(intent(true).wantOllie,false);
  events.dispatchEvent(new Event('blur'));controller.reset();assert.equal(intent(false).toggleAirFlip,false);
  input.dispose();delete (globalThis as Record<string,unknown>).window;
});

test('actual rider rotates around its center without changing velocity or making the camera target orbit',async()=>{
  const flip=await fixture(),control=await fixture();
  for(const f of [flip,control])f.player.body.setLinvel({x:0,y:0,z:-8},true);
  let inverted=false;
  for(let i=0;i<140;i++) {
    flip.tick({...idle,push:1,steer:1,toggleAirFlip:i===0});control.tick();
    const normal=up.clone().applyQuaternion(flip.player.mesh.quaternion);
    if(normal.y<-0.95)inverted=true;
    assert.equal(flip.player.crashed,false);
    assert.ok(flip.player.velocity.distanceTo(control.player.velocity)<0.0001,'flip changed linear momentum');
    assert.ok(flip.player.renderPosition.distanceTo(control.player.renderPosition)<0.002,'camera target orbits during flip');
  }
  assert.ok(inverted);
  flip.player.reset(flip.ramp.spawn);assert.equal(flip.player.aerial.engaged,false);
  assert.ok(flip.player.mesh.quaternion.angleTo(new THREE.Quaternion())<0.0001);
  flip.world.free();control.world.free();
});

test('toggle back restores yaw steering and keeps the existing aerial tilt',async()=>{
  const f=await fixture();
  for(let i=0;i<25;i++)f.tick({...idle,push:1,toggleAirFlip:i===0});
  f.tick({...idle,toggleAirFlip:true});assert.equal(f.player.aerial.active,false);
  const before=f.player.mesh.quaternion.clone(),tilt=up.clone().applyQuaternion(before).y;
  for(let i=0;i<20;i++)f.tick({...idle,steer:1});
  assert.ok(before.angleTo(f.player.mesh.quaternion)>0.5);
  assert.ok(Math.abs(up.clone().applyQuaternion(f.player.mesh.quaternion).y-tilt)<0.0001);
  assert.equal(f.player.crashed,false);f.world.free();
});

test('board flick tricks and held grabs remain independent of whole-body flips',async()=>{
  for(const grab of [false,true]) {
    const f=await fixture();let inverted=false;
    for(let i=0;i<90;i++) {
      if(f.player.uprightDot<-0.5)inverted=true;
      f.tick({...idle,push:1,toggleAirFlip:i===0,grabModifier:grab,grabDX:grab?-1:0,grabPress:1,
        flickReady:!grab&&i===0,flickDX:-80});
      assert.equal(f.player.crashed,false);
      if(grab) {
        assert.equal(f.tricks.state.grab?.id,'tomahawk');
        const board=f.player.mesh.children[0]!;
        for(const side of [-1,1]) {
          const foot=f.player.mesh.getObjectByName(`foot-${side}`)!;
          const sole=foot.localToWorld(new THREE.Vector3(0,BOARD.soleBottom,0));
          assert.ok(Math.abs(board.worldToLocal(sole).y-BOARD.gripY)<0.00001);
        }
      } else {
        if(f.tricks.state.active) {
          assert.equal(f.tricks.state.active.id,'kickflip');assert.ok(f.tricks.state.boardSpin.z<0);
        } else assert.deepEqual(f.tricks.state.combo,['Kickflip']);
      }
    }
    assert.ok(inverted);
    if(grab) {
      assert.ok(f.tricks.state.grabTime>0.7);
      const hand=f.player.mesh.getObjectByName('hand-1')!.getWorldPosition(new THREE.Vector3());
      const grip=GRABS.tomahawk.grip;
      const target=f.player.mesh.children[0]!.localToWorld(new THREE.Vector3(grip.x,grip.y,grip.z).applyAxisAngle(up,RIDER.stanceY));
      assert.ok(hand.distanceTo(target)<0.025);
    }
    f.world.free();
  }
});

test('a complete flip can land and reset controls; an inverted touchdown ragdolls',async()=>{
  for(const complete of [true,false]) {
    const f=await fixture(complete?6:12);let inverted=false,stopped=false,landed=false;
    // A dead drop long enough for a full rotation exceeds the severe-landing speed; launch upward as a jump would.
    if(complete)f.player.body.setLinvel({x:0,y:10,z:-8},true);
    for(let i=0;i<800;i++) {
      let toggle=i===0;
      if(!stopped && i>5 && (complete ? inverted&&f.player.uprightDot>0.995 : f.player.uprightDot<-0.995)) {
        toggle=true;stopped=true;
      }
      f.tick({...idle,push:stopped?0:1,toggleAirFlip:toggle});
      if(f.player.uprightDot<-0.99)inverted=true;
      if(f.player.crashed)break;
      if(f.player.grounded) {landed=true;break;}
    }
    assert.ok(stopped && inverted);
    if(complete) {
      assert.ok(landed);assert.equal(f.player.crashed,false);assert.equal(f.player.aerial.engaged,false);
      assert.equal(f.tricks.state.message,'Frontflip · Perfect');assert.equal(f.tricks.state.lastLanded,'Frontflip');
    }
    else {assert.equal(f.player.crashed,true);assert.equal(f.player.aerial.active,false);}
    f.world.free();
  }
});

test('landed rotations are named by direction and count; partial turns are not announced',()=>{
  const turn=Math.PI*2;
  assert.equal(describeAirRotation({pitch:0.3*turn,roll:-0.2*turn}),null);
  assert.equal(describeAirRotation({pitch:-turn,roll:0}),'Frontflip');
  assert.equal(describeAirRotation({pitch:0.97*turn,roll:0}),'Backflip');
  assert.equal(describeAirRotation({pitch:2*turn,roll:0}),'Double Backflip');
  assert.equal(describeAirRotation({pitch:0,roll:-3*turn}),'Triple Barrel Roll');
  assert.equal(describeAirRotation({pitch:0,roll:4*turn}),'4x Barrel Roll');
  assert.equal(describeAirRotation({pitch:-turn/Math.SQRT2,roll:turn/Math.SQRT2}),'Corkscrew');
  const air=createAirRotation();
  for(let i=0;i<60;i++)air.update(dt,i===0,-1,0,true);
  assert.ok(air.state.pitch>2 && air.state.roll===0);
  air.reset();assert.equal(air.state.pitch,0);
});

test('the head tumbles with the chest during a flip while retaining a comfortable neck',async()=>{
  const f=await fixture();let inverted=false;
  for(let i=0;i<140;i++) {
    f.tick({...idle,push:1,toggleAirFlip:i===0});
    const head=f.player.mesh.getObjectByName('head')!.getWorldQuaternion(new THREE.Quaternion());
    const headUp=up.clone().applyQuaternion(head),bodyUp=up.clone().applyQuaternion(f.player.mesh.quaternion);
    const chestUp=up.clone().applyQuaternion(f.player.mesh.getObjectByName('chest')!.parent!.getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(headUp.dot(chestUp)>0.94,`neck did not follow the leaning chest at ${i}`);
    if(bodyUp.y<-0.95)inverted=true;
  }
  assert.ok(inverted);f.world.free();
});

test('flip inputs follow the course, not the board: W is a front flip facing either way',async()=>{
  const turn=new THREE.Vector3(0,1,0);
  for(const [pitch,roll] of [[1,0],[-1,0],[0,1],[1,-1]]) {
    const straight=createAirRotation();
    for(let i=0;i<40;i++)straight.update(dt,i===0,pitch!,roll!,true);
    for(const heading of [Math.PI/2,Math.PI,-2.2]) {
      const turned=createAirRotation(),yaw=new THREE.Quaternion().setFromAxisAngle(turn,heading);
      for(let i=0;i<40;i++)turned.update(dt,i===0,pitch!,roll!,true,heading);
      // Same tumble seen from outside: world pose = the straight-ahead tumble applied to the turned board.
      const world=yaw.clone().multiply(turned.rotation),expected=straight.rotation.clone().multiply(yaw);
      assert.ok(world.angleTo(expected)<1e-6,`tumble changed with heading ${heading}`);
      assert.ok(Math.abs(turned.state.pitch-straight.state.pitch)<1e-9 && Math.abs(turned.state.roll-straight.state.roll)<1e-9);
    }
  }
  // In play: spin to switch in steering mode, then hold W. The rider's head must go forward, down the course.
  for(const switchStance of [false,true]) {
    const f=await fixture(14);f.player.body.setLinvel({x:0,y:0,z:-10},true);
    for(let i=0;i<110 && switchStance;i++)f.tick({...idle,steer:f.player.forward.z<0.999?1:0});
    assert.ok(switchStance ? f.player.forward.z>0.99 : f.player.forward.z<-0.99);
    for(let i=0;i<18;i++)f.tick({...idle,push:1,toggleAirFlip:i===0});
    const bodyUp=up.clone().applyQuaternion(f.player.mesh.quaternion);
    assert.ok(bodyUp.z<-0.3,`W should tip the rider forward down the course, switch=${switchStance}`);
    assert.ok(f.player.aerial.pitch<0,'forward rotation counts toward a front flip');
    f.world.free();
  }
});
