import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {createBoardPlayer} from '../src/player/board.ts';
import {createTrickSystem} from '../src/player/tricks/tricks.ts';
import {createSurfaceSupport} from '../src/player/visuals/surfaceSupport.ts';
import {headGeometry} from '../src/player/characters/geometry.ts';
import {characterProportions} from '../src/player/characters/catalog.ts';
import {BOARD,RIDER} from '../src/player/dimensions.ts';
import {createDeckFrame,LAUNCH_RECOVERY} from '../src/player/movement/deckFrame.ts';
import {makeCurbCollision} from '../src/world/physics/curbSurface.ts';
import {metres,mph,speedFromMph,REFERENCE_RIDER_HEIGHT_UNITS} from '../src/units.ts';
import type {PlayerIntent} from '../src/player/controller.ts';
import type {RampWorld} from '../src/world/ramp.ts';

const dt=1/120,up=new THREE.Vector3(0,1,0),idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};
async function fixture(speed=25,headOn=false,gap=false,mode:'skate'|'snowboard'='skate',fromGround=false,rebase=false) {
  await RAPIER.init();const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  const floor=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-.1,0));world.createCollider(RAPIER.ColliderDesc.cuboid(30,.1,200),floor);
  const fixed=[floor];let distance=0;
  for(const [z,length] of gap?[[-2.5,5],[-100,184]]:[[-80,200]]) {
    const wall=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(.4,10,z));world.createCollider(RAPIER.ColliderDesc.cuboid(.12,10,length/2),wall);fixed.push(wall);
  }
  const anchor=new THREE.Vector3(),ramp:RampWorld={mesh:new THREE.Group(),spawn:new THREE.Vector3(0,.02,0),anchor,surfaceOrigin:anchor,surfaceNormal:up.clone(),forward:new THREE.Vector3(0,0,-1),get distance(){return distance;},endZ:-99999,grindRails:[],scroll:shift=>{if(!rebase)return new THREE.Vector3();distance+=shift;for(const body of fixed){const p=body.translation();body.setTranslation({x:p.x,y:p.y,z:p.z+shift},true);}world.propagateModifiedBodyPositionsToColliders();return new THREE.Vector3(0,0,shift);},reset:()=>{},prepareNextChunk:()=>true,flushDeferredDestroy:()=>{}};
  const player=createBoardPlayer(new THREE.Scene(),world,ramp,mode),tricks=createTrickSystem();
  const tick=(intent=idle)=>{player.update(dt,intent,tricks.state);world.step();player.sync(false);};
  for(let i=0;i<60;i++)tick();
  player.body.setTranslation({x:fromGround?-.15:0,y:fromGround?.22:4,z:-.5},true);player.body.setLinvel({x:headOn?speed:fromGround?1.3:.8,y:0,z:headOn?0:-speed},true);
  return {world,player,tick};
}

test('world measurements use the 1.75 m default rider reference',()=>{
  const head=headGeometry('boy');head.computeBoundingBox();
  const actualHeight=RIDER.hipHeight+characterProportions('boy').headHeight+head.boundingBox!.max.y-BOARD.gripY;
  assert.ok(Math.abs(actualHeight-REFERENCE_RIDER_HEIGHT_UNITS)<1e-6,'the fixed reference must agree with the actual default anatomy');head.dispose();
  assert.ok(Math.abs(metres(REFERENCE_RIDER_HEIGHT_UNITS)-1.75)<1e-12);
  assert.ok(Math.abs(mph(speedFromMph(60))-60)<1e-12);
  assert.ok(Math.abs(metres(speedFromMph(60)*3600)-1609.344*60)<1e-7);
});

test('manual aerial control retains the takeoff tilt through a full turn',async()=>{
  await RAPIER.init();const world=new RAPIER.World({x:0,y:-18,z:0});
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()),rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.35,0,.72));
  const frame={position:new THREE.Vector3(),rotation,up:up.clone().applyQuaternion(rotation),forward:new THREE.Vector3(0,0,-1).applyQuaternion(rotation),airOffset:new THREE.Vector3()};
  const deck=createDeckFrame(body,new THREE.Vector3(0,0,-1),up,new THREE.Quaternion(),frame),initial=rotation.clone();
  try {
    deck.preserveLaunchAngle();deck.apply(0,up,false);
    for(let i=0;i<180;i++){deck.step(dt,false);deck.apply(0,up,false);}
    assert.ok(rotation.angleTo(initial)<1e-6,'recovery must not fight a manually controlled air');
    for(let i=0;i<=120;i++){deck.step(dt,false);deck.apply(i/120*Math.PI*2,up,false);}
    assert.ok(rotation.angleTo(initial)<1e-6,'a 360 must retain the banked takeoff frame');
    deck.land();deck.apply(0,up,false);assert.ok(rotation.angleTo(new THREE.Quaternion())<1e-6);
  } finally {world.free();}
});

for(const mode of ['skate','snowboard'] as const)test(`${mode}: a fast wall catch rides the actual wall, keeps falling, and returns to ground`,async()=>{
  const f=await fixture(25,false,false,mode);let frames=0,vertical=false,minHeight=4;
  try {
    for(let i=0;i<240;i++) {
      f.tick();assert.equal(f.player.crashed,false,`${f.player.crashCause} at ${f.player.position.toArray()}`);
      if(f.player.wallRiding){frames++;const normal=up.clone().applyQuaternion(f.player.body.rotation());if(Math.abs(normal.dot(up))<.15)vertical=true;}
      minHeight=Math.min(minHeight,f.player.position.y);
    }
    assert.ok(frames>35 && vertical,`wall ride must establish real vertical support: ${frames} frames`);
    assert.ok(minHeight<3.5,'gravity must pull the rider down the wall');
    assert.equal(f.player.wallRiding,false);assert.equal(f.player.grounded,true,'wall-to-ground transition should return to ordinary wheel support');
    assert.ok(up.clone().applyQuaternion(f.player.body.rotation()).dot(up)>.99);
  } finally {f.world.free();}
});

test('slow contact and head-on impacts never become wall rides',async()=>{
  for(const [speed,headOn] of [[5,false],[25,true]] as const) {
    const f=await fixture(speed,headOn);
    try {
      for(let i=0;i<45 && !f.player.crashed;i++){f.tick();assert.equal(f.player.wallRiding,false);}
      if(headOn)assert.equal(f.player.crashed,true,'head-on walls must remain hard obstacles');
    } finally {f.world.free();}
  }
});

test('a doorway breaks wall support instead of being filled by an invisible surface',async()=>{
  const f=await fixture(25,false,true);let caught=false,entered=false;
  try {
    for(let i=0;i<90 && !f.player.crashed;i++) {
      f.tick();caught ||=f.player.wallRiding;
      if(f.player.position.z< -5.5 && f.player.position.z> -7.4){entered=true;assert.equal(f.player.wallRiding,false);}
    }
    assert.ok(caught && entered,'ride the wall into the actual doorway');
  } finally {f.world.free();}
});

test('opt-in curb support eases only a short shoulder and keeps the sidewalk centre exact',()=>{
  const geometry=makeCurbCollision(1.8,.08,70),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.updateMatrixWorld(true);
  const height=(x:number)=>new THREE.Raycaster(new THREE.Vector3(x,1,0),new THREE.Vector3(0,-1,0)).intersectObject(mesh)[0]?.point.y;
  assert.ok(Math.abs(height(0)!-.04)<1e-6);assert.ok(Math.abs(height(.9)!-.04)<1e-6);
  assert.ok(height(1)!<.04 && height(1)!>-.04);assert.equal(height(1.13),undefined);
  geometry.dispose();
});

test('wheel fitting does not invent a tilted plane between two horizontal levels',async()=>{
  await RAPIER.init();const world=new RAPIER.World({x:0,y:-18,z:0});
  const floor=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-.1,0));world.createCollider(RAPIER.ColliderDesc.cuboid(5,.1,5),floor);
  const step=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(2.5,.04,0));world.createCollider(RAPIER.ColliderDesc.cuboid(2.5,.04,5),step);
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,.25,0));world.step();
  const support=createSurfaceSupport(world,body,up),rotation=new THREE.Quaternion(),at=new THREE.Vector3(0,.25,0);
  try {
    support.fit(at,rotation,up);assert.ok(rotation.angleTo(new THREE.Quaternion())<.001,'a curb must not turn flat surface normals into an instant roll');
    assert.ok(at.y+support.heightOffset+BOARD.wheelY-BOARD.wheelRadius>=.08-.002,'the higher wheel must stay above the step');
  } finally {world.free();}
});

test('an ollie leaves a wall without being pulled back into it',async()=>{
  const f=await fixture();
  try {
    let caught=false;
    for(let i=0;i<60;i++){f.tick();if(f.player.wallRiding && f.player.grounded){caught=true;break;}}
    assert.ok(caught && f.player.canOllie);
    f.tick({...idle,wantOllie:true,olliePower:.6});assert.equal(f.player.wallRiding,false);assert.equal(f.player.airborne,true);
    assert.ok(f.player.velocity.x< -2,'pop away from the right wall');
    for(let i=0;i<12;i++){f.tick();assert.equal(f.player.wallRiding,false);assert.equal(f.player.crashed,false);}
  } finally {f.world.free();}
});

test('an actual ollie can catch a wall during its airborne spring lockout',async()=>{
  const f=await fixture(25,false,false,'skate',true);let caught=false;
  try {
    f.tick({...idle,wantOllie:true,olliePower:.5});assert.equal(f.player.airborne,true);
    for(let i=0;i<110;i++){f.tick();assert.equal(f.player.crashed,false,`ollie catch: ${f.player.crashCause}`);caught ||=f.player.wallRiding && f.player.grounded;}
    assert.ok(caught,'normal jump inputs must establish real wall contact before the ollie lockout expires');
  } finally {f.world.free();}
});

test('streaming an origin shift does not eject an established wall ride',async()=>{
  const f=await fixture(25,false,false,'skate',false,true);let shifted=false,after=0;
  try {
    f.player.body.setTranslation({x:0,y:4,z:-62},true);
    for(let i=0;i<65;i++) {
      f.tick();assert.equal(f.player.crashed,false);
      if(f.player.originShift.lengthSq()>0){shifted=true;assert.equal(f.player.wallRiding,true);}
      else if(shifted && after++<3)assert.equal(f.player.wallRiding,true,'the query refresh must preserve the existing wall contact');
    }
    assert.ok(shifted && after>=3);
  } finally {f.world.free();}
});

test('a doorway lintel cannot substitute for a missing wall at wheel height',async()=>{
  const f=await fixture(25,false,true);
  try {
    const lintel=f.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(.4,11.05,-6.5));
    f.world.createCollider(RAPIER.ColliderDesc.cuboid(.12,8.95,1.5),lintel);f.world.step();
    f.player.body.setTranslation({x:0,y:2,z:-6.5},true);f.player.body.setLinvel({x:0,y:0,z:-25},true);
    f.tick();assert.equal(f.player.wallRiding,false,'wall queries must include wheel height, even when the header is close above it');
    assert.equal(f.player.crashed,false);
  } finally {f.world.free();}
});

test('ordinary jumps ease inherited bank angle after a brief hold, preserving heading and momentum',async()=>{
  await RAPIER.init();const world=new RAPIER.World({x:0,y:-18,z:0});
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()),rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.4,.2,.65));
  const frame={position:new THREE.Vector3(),rotation,up:up.clone().applyQuaternion(rotation),forward:new THREE.Vector3(0,0,-1).applyQuaternion(rotation),airOffset:new THREE.Vector3()};
  const deck=createDeckFrame(body,new THREE.Vector3(0,0,-1),up,new THREE.Quaternion(),frame),initial=rotation.clone();
  const target=new THREE.Quaternion(0,initial.y,0,initial.w).normalize();
  try {
    body.setLinvel({x:3,y:5,z:-25},true);deck.preserveLaunchAngle();deck.apply(0,up,false);
    for(let i=0;i<20;i++){deck.step(dt);deck.apply(0,up,false);}
    assert.ok(rotation.angleTo(initial)<1e-6,'preserve the immediate takeoff angle');
    let previous=rotation.clone(),previousTilt=rotation.angleTo(target);
    for(let i=0;i<140;i++) {
      deck.step(dt);deck.apply(0,up,false);
      const tilt=rotation.angleTo(target);
      assert.ok(tilt<=previousTilt+1e-6,'recover progressively without overshooting');
      assert.ok(rotation.angleTo(previous)<=LAUNCH_RECOVERY.maxRate*dt+1e-6,'no sudden upright snap');
      previous.copy(rotation);previousTilt=tilt;
    }
    assert.ok(rotation.angleTo(target)<.025,'ordinary airtime should shed most of the inherited tilt');
    assert.deepEqual({...body.linvel()},{x:3,y:5,z:-25},'recovery must not steer the flight trajectory');
    const manual=rotation.clone();
    for(let i=0;i<120;i++){deck.step(dt,false);deck.apply(0,up,false);}
    assert.ok(rotation.angleTo(manual)<1e-6,'manual takeover freezes the current recovered launch offset');
    // Yaw spins remain available while the takeoff tilt recovers.
    deck.reset();rotation.copy(initial);deck.preserveLaunchAngle();deck.apply(0,up,false);
    for(let i=0;i<=180;i++){deck.step(dt);deck.apply(i/180*Math.PI*2,up,false);}
    assert.ok(rotation.angleTo(target)<.025,'complete a full spin with recovered pitch/roll and preserved heading');
  } finally {world.free();}
});

test('assisted bank recovery carries its heading into the landing without a yaw snap',async()=>{
  const f=await fixture();let flying=false,landed=false,lastHeading=0;
  try {
    const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.4,.45,.65));
    f.player.body.setTranslation({x:-10,y:4,z:-.5},true);f.player.body.setRotation(rotation,true);
    f.player.body.setLinvel({x:-5,y:0,z:-18},true);
    for(let i=0;i<240;i++) {
      f.tick();assert.equal(f.player.crashed,false);
      const heading=Math.atan2(-f.player.forward.x,-f.player.forward.z);
      if(f.player.airborne){flying=true;lastHeading=heading;}
      else if(flying) {
        assert.ok(Math.abs(Math.atan2(Math.sin(heading-lastHeading),Math.cos(heading-lastHeading)))<.025,'touchdown should retain the aerial heading');
        landed=true;break;
      }
    }
    assert.ok(flying && landed);
  } finally {f.world.free();}
});
