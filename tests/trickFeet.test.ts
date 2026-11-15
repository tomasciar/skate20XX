import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrickSystem } from '../src/player/tricks.ts';
import { createSkaterVisual } from '../src/player/skaterVisual.ts';
import { BOARD, FOOT_Y, RIDER } from '../src/player/dimensions.ts';
import { GRABS } from '../src/player/grabs.ts';

const base={dt:1/120,speed:30,push:0,verticalSpeed:0,grinding:false,crouch:0,lean:0,
  airborne:true,bail:false,wheelRoll:0,boardSpin:{x:0,y:0,z:0}};
const arrows=[[-80,0],[80,0],[0,-80],[0,80],[-80,-80],[80,-80]];
function start(dx:number,dy:number) {
  const tricks=createTrickSystem(),visual=createSkaterVisual();
  for(let i=0;i<120;i++)visual.setPose(base);
  tricks.tryFlick(dx,dy,true);
  const foot=(side:number)=>visual.root.getObjectByName(`foot-${side}`)!;
  return {tricks,visual,foot};
}

test('every arrow trick has a distinct front-foot flick or rear-foot scoop',()=>{
  const poses=new Set<string>();
  for(const [dx,dy] of arrows) {
    const {tricks,visual,foot}=start(dx!,dy!);const trick=tricks.state.active!;
    tricks.update(trick.duration*0.28,false,1,30);
    visual.setPose({...base,trick,trickTime:tricks.state.t,boardSpin:tricks.state.boardSpin});
    const front=foot(-1).position,rear=foot(1).position;
    assert.ok(front.y>FOOT_Y+0.2 && rear.y>FOOT_Y+0.15,'feet must lift clear while the deck spins');
    if(trick.id==='kickflip')assert.ok(front.z<-0.15,'kickflip needs a toe-side flick');
    if(trick.id==='heelflip')assert.ok(front.z>0.15,'heelflip needs the opposite heel-side flick');
    if(trick.id==='shoveit' || trick.id==='fs180')assert.ok(rear.z<-0.1,'shove/pivot needs a tail scoop');
    if(trick.id==='varial')assert.ok(front.z<-0.1 && rear.z<-0.1);
    if(trick.id==='hardflip')assert.ok(front.z<-0.1 && rear.z>0.1);
    poses.add([front.x,front.z,rear.x,rear.z].map(value=>value.toFixed(3)).join(','));
  }
  assert.equal(poses.size,6);
});

test('animated feet keep connected legs, return for the catch and never repeat while the trick is held',()=>{
  for(const [dx,dy] of arrows) {
    const {tricks,visual,foot}=start(dx!,dy!);const trick=tricks.state.active!;
    for(let frame=0;frame<100;frame++) {
      tricks.update(base.dt,false,1,30);
      visual.setPose({...base,trick,trickTime:tricks.state.t,boardSpin:tricks.state.boardSpin});
      visual.root.updateMatrixWorld(true);
      for(const side of [-1,1]) {
        const shin=visual.root.getObjectByName(`shin-${side}`)!;
        const ankle=foot(side).localToWorld(new THREE.Vector3(0,0.06,0));
        const end=shin.localToWorld(new THREE.Vector3(0,0.5,0));
        assert.ok(end.distanceTo(ankle)<0.001,`${trick.name}: shin separated from the kicked foot`);
        assert.ok(Math.abs(shin.scale.y-RIDER.lowerLeg)<0.00001,'leg bone length changed');
        if(tricks.state.t>=trick.duration) {
          assert.ok(foot(side).position.distanceTo(new THREE.Vector3(side*0.255,FOOT_Y,0))<1e-8);
          assert.ok(foot(side).quaternion.angleTo(new THREE.Quaternion())<1e-8);
        }
      }
    }
  }
});

test('landing, grinding and bailing cancel the kick pose immediately',()=>{
  for(const exit of [{airborne:false},{grinding:true},{bail:true}]) {
    const {tricks,visual,foot}=start(-80,0);const trick=tricks.state.active!;
    const pose={...base,trick,trickTime:0.15};
    visual.setPose(pose);assert.ok(foot(-1).position.y>FOOT_Y+0.1);
    visual.setPose({...pose,...exit});
    for(const side of [-1,1]) {
      assert.ok(foot(side).position.distanceTo(new THREE.Vector3(side*0.255,FOOT_Y,0))<1e-8);
      assert.ok(foot(side).quaternion.angleTo(new THREE.Quaternion())<1e-8);
    }
  }
});

test('kick animations stay relative to the rider during body flips and leave held grabs alone',()=>{
  const {tricks,visual,foot}=start(80,-80);const trick=tricks.state.active!;
  const rotated=createSkaterVisual();rotated.root.rotation.set(1.7,0.8,-0.5);
  const pose={...base,trick,trickTime:0.15};
  visual.setPose(pose);rotated.setPose(pose);
  for(const side of [-1,1]) {
    const other=rotated.root.getObjectByName(`foot-${side}`)!;
    assert.ok(foot(side).position.distanceTo(other.position)<1e-8);
    assert.ok(foot(side).quaternion.angleTo(other.quaternion)<1e-6);
  }
  for(let i=0;i<180;i++) {
    visual.setPose({...pose,grab:GRABS.tomahawk});rotated.setPose({...base,grab:GRABS.tomahawk});
  }
  for(const model of [visual,rotated]) {
    model.root.updateMatrixWorld(true);
    for(const side of [-1,1]) {
      const sole=model.root.getObjectByName(`foot-${side}`)!.localToWorld(new THREE.Vector3(0,BOARD.soleBottom,0));
      assert.ok(Math.abs(model.board.worldToLocal(sole).y-BOARD.gripY)<0.00001);
    }
  }
});
