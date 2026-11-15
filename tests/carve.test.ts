import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CARVE, carveTurnRate, carveLoad, carveDrag, carveLean } from '../src/player/carve.ts';
import { createSkaterVisual } from '../src/player/skaterVisual.ts';
import { createBoardPlayer } from '../src/player/board.ts';
import { createTrickSystem } from '../src/player/tricks.ts';
import { BOARD } from '../src/player/dimensions.ts';
import type { RampWorld } from '../src/world/ramp.ts';
import type { PlayerIntent } from '../src/player/controller.ts';

const dt=1/120, up=new THREE.Vector3(0,1,0);
const idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
  wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};

test('turning tightens at low speed and is bounded by lateral grip at high speed',()=>{
  assert.ok(Math.abs(carveTurnRate(0)-1.3)<1e-9);
  let previousRadius=0;
  for(const speed of [2,6,10,14,20,40,80]) {
    const rate=carveTurnRate(speed), radius=speed/rate;
    assert.ok(rate*speed<=CARVE.maxLateral+1e-9,`lateral grip exceeded at ${speed}`);
    assert.ok(radius>previousRadius,'faster riding must widen the arc');previousRadius=radius;
  }
  assert.ok(carveTurnRate(80)<0.5 && carveTurnRate(80)>0.25);
  assert.equal(carveDrag(30,0),0);
  assert.ok(carveDrag(30,0.3)<carveDrag(30,1)*0.15,'gentle steering should be nearly free');
  assert.ok(Math.abs(carveDrag(30,1)-CARVE.scrub)<1e-9);
  assert.ok(carveLoad(3,1)<0.2 && carveLoad(40,1)===1);
  assert.ok(carveLean(0,1)>0.2 && carveLean(0,1)<0.5 && carveLean(40,-1)===-1);
});

test('a carve rolls the deck under planted soles while the wheels stay level',()=>{
  const visual=createSkaterVisual();
  const base={dt,speed:25,push:0,verticalSpeed:0,grinding:false,crouch:0,lean:0,airborne:false,bail:false,wheelRoll:0,boardSpin:{x:0,y:0,z:0}};
  for(const carve of [-1,1]) {
    for(let i=0;i<240;i++)visual.setPose({...base,lean:carve,carve});
    visual.root.updateMatrixWorld(true);
    assert.ok(Math.abs(visual.deck.rotation.z+carve*CARVE.deckTilt)<1e-4);
    // The inside edge drops: a right turn lowers the board's right rail.
    const edge=visual.deck.localToWorld(new THREE.Vector3(carve*0.1,BOARD.gripY,0));
    assert.ok(edge.y<BOARD.gripY-0.008);
    for(const side of [-1,1]) {
      const foot=visual.root.getObjectByName(`foot-${side}`)!;
      const sole=visual.deck.worldToLocal(foot.localToWorld(new THREE.Vector3(0,BOARD.soleBottom,0)));
      assert.ok(Math.abs(sole.y-BOARD.gripY)<1e-8 && Math.abs(sole.x)<1e-8,'sole left the tilted grip');
      const toe=visual.deck.worldToLocal(foot.localToWorld(new THREE.Vector3(0,BOARD.soleBottom,-0.1)));
      assert.ok(Math.abs(toe.y-BOARD.gripY)<1e-8,'sole is not flat on the tilted grip');
      const shin=visual.root.getObjectByName(`shin-${side}`)!;
      assert.ok(foot.localToWorld(new THREE.Vector3(0,0.06,0)).distanceTo(shin.localToWorld(new THREE.Vector3(0,0.5,0)))<1e-6);
    }
    assert.equal(visual.board.rotation.z,0);
    for(const wheel of visual.wheels)assert.equal(wheel.position.y,BOARD.wheelY);
    const chest=visual.root.getObjectByName('chest')!.getWorldPosition(new THREE.Vector3());
    assert.ok(chest.x*carve>0.03,'rider should put weight over the inside edge');
  }
  for(let i=0;i<240;i++)visual.setPose({...base,airborne:true,carve:1});
  assert.equal(visual.deck.rotation.z,0);
});

async function fixture() {
  await RAPIER.init();
  const scene=new THREE.Scene(),world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  const ground=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-0.1,0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(240,0.1,5000),ground);
  const anchor=new THREE.Vector3(),spawn=new THREE.Vector3(0,0.02,0);
  const ramp:RampWorld={mesh:new THREE.Group(),spawn,anchor,surfaceOrigin:anchor,endZ:-99999,
    surfaceNormal:up.clone(),forward:new THREE.Vector3(0,0,-1),distance:0,grindRails:[],
    scroll:()=>new THREE.Vector3(),reset:()=>{},prepareNextChunk:()=>true,flushDeferredDestroy:()=>{}};
  const player=createBoardPlayer(scene,world,ramp),tricks=createTrickSystem();
  const tick=(intent:PlayerIntent=idle)=>{player.update(dt,intent,tricks.state);world.step();player.sync();};
  for(let i=0;i<60;i++)tick();
  return {world,player,tick};
}

test('the ridden board eases into turns, holds a grip-limited arc and scrubs speed in hard carves',async()=>{
  for(const launch of [8,45]) {
    const carving=await fixture(),straight=await fixture();
    for(const f of [carving,straight])f.player.body.setLinvel({x:0,y:0,z:-launch},true);
    let previousHeading=0,peakRate=0,firstRate=0;
    for(let i=0;i<120;i++) {
      carving.tick({...idle,steer:1});straight.tick();
      const heading=Math.atan2(carving.player.forward.x,-carving.player.forward.z);
      const rate=(heading-previousHeading)/dt;previousHeading=heading;
      if(i===0)firstRate=rate;
      peakRate=Math.max(peakRate,rate);
      assert.ok(rate*carving.player.speed<=CARVE.maxLateral*1.02,`lateral grip exceeded at ${launch}`);
      assert.equal(carving.player.crashed,false);
    }
    assert.ok(firstRate<peakRate*0.2,'turn-in should build with the lean, not snap');
    assert.ok(Math.abs(peakRate-carveTurnRate(carving.player.speed))<0.15,`settled rate ${peakRate}`);
    assert.ok(carving.player.velocity.clone().normalize().dot(carving.player.forward)>0.93,'board should roll where it points');
    if(launch>20)assert.ok(carving.player.speed<straight.player.speed-1.5,'a full carve at speed should scrub speed');
    carving.world.free();straight.world.free();
  }
});

test('riding switch still leans into the turn as travelled',async()=>{
  const lowered=async(switchStance:boolean)=>{
    const f=await fixture();
    if(switchStance) {
      // Spin 180 in the air and land rolling the same way, as an airborne half-turn does in play.
      f.player.reset(new THREE.Vector3(0,6,0));f.player.body.setLinvel({x:0,y:0,z:-20},true);
      for(let i=0;i<400 && !(f.player.grounded && i>60);i++)f.tick({...idle,steer:f.player.forward.z<0.995?1:0});
      assert.ok(f.player.grounded && f.player.forward.z>0.98,'fixture should be rolling switch');
    } else f.player.body.setLinvel({x:0,y:0,z:-20},true);
    const startX=f.player.position.x;
    for(let i=0;i<90;i++)f.tick({...idle,steer:1});
    assert.ok(f.player.position.x>startX+0.5,'steering right must carry the rider to the right');
    f.player.mesh.updateMatrixWorld(true);
    const deck=f.player.mesh.children[0]!.children[0]!;
    const rightEdge=deck.localToWorld(new THREE.Vector3(0.1,0,0)),leftEdge=deck.localToWorld(new THREE.Vector3(-0.1,0,0));
    const chest=f.player.mesh.getObjectByName('chest')!.getWorldPosition(new THREE.Vector3());
    // In world terms: which side of the board sits lower, and which side the chest is over.
    const lowSide=(rightEdge.y<leftEdge.y ? rightEdge : leftEdge).x-f.player.mesh.position.x;
    const result={lowSide,chest:chest.x-f.player.mesh.position.x};f.world.free();return result;
  };
  for(const stance of [false,true]) {
    const {lowSide,chest}=await lowered(stance);
    assert.ok(lowSide>0.02,`inside (right) edge should drop, switch=${stance}`);
    assert.ok(chest>0,`rider should lean right in a right turn, switch=${stance}`);
  }
});
