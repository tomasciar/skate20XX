import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createInput } from '../src/input.ts';
import { createController } from '../src/player/controller.ts';
import { createTrickSystem, type GroundTrick } from '../src/player/tricks.ts';
import { createSkaterVisual } from '../src/player/skaterVisual.ts';
import { GRABS, screenGrabFacing } from '../src/player/grabs.ts';
import { BOARD, RIDER } from '../src/player/dimensions.ts';

const dt=1/120,up=new THREE.Vector3(0,1,0),forward=new THREE.Vector3(0,0,-1);
const base={dt,speed:25,push:0,verticalSpeed:0,grinding:false,crouch:0,lean:0,airborne:false,bail:false,
  wheelRoll:0,boardSpin:{x:0,y:0,z:0}};

test('held arrows select grounded tricks, survive consumption, and release on keyup or blur',()=>{
  const events=new EventTarget();Object.assign(globalThis,{window:events});
  const input=createInput(),controller=createController(),tricks=createTrickSystem();
  const key=(type:string,code:string)=>events.dispatchEvent(Object.assign(new Event(type),{code,repeat:false}));
  const step=()=>{
    input.beginFrame();const intent=controller.update(input.state,dt);
    tricks.setGround(intent.groundDX ?? 0,intent.groundDY ?? 0,true,undefined,intent.grabPress);
    tricks.update(dt,true,1,20);input.consume();return intent;
  };
  try {
    for(const [keyName,name] of [['ArrowDown','Manual'],['ArrowUp','Nose Manual'],['ArrowLeft','Melon Grab'],['ArrowRight','Indy Grab']]) {
      key('keydown',keyName!);step();assert.equal(tricks.state.ground?.name,name);
      const time=tricks.state.groundTime;
      step();assert.ok(tricks.state.groundTime>time);assert.ok(tricks.state.groundMeters>0);
      assert.equal(tricks.state.active,null);assert.equal(tricks.state.grab,null);
      key('keyup',keyName!);step();assert.equal(tricks.state.ground,null);
    }
    key('keydown','ArrowDown');step();events.dispatchEvent(new Event('blur'));step();
    assert.equal(tricks.state.ground,null);assert.equal(input.state.arrowDY,0);
  } finally {input.dispose();delete (globalThis as Record<string,unknown>).window;}
});

test('grounded grabs latch rider-relative facing until a fresh press and stop in air or on rails',()=>{
  const tricks=createTrickSystem();
  const right=screenGrabFacing(forward,forward,up),left=screenGrabFacing(forward.clone().negate(),forward,up);
  tricks.setGround(-1,0,true,right,1);assert.equal(tricks.state.ground?.grab?.id,'melon');
  tricks.update(0.3,true,1,20);
  tricks.setGround(-1,0,true,left,1);assert.equal(tricks.state.ground?.grab?.id,'melon');
  assert.equal(tricks.state.groundTime,0.3);
  tricks.setGround(-1,0,true,left,2);assert.equal(tricks.state.ground?.grab?.id,'indy');
  assert.equal(tricks.state.groundTime,0);
  tricks.update(dt,false,1,20);assert.equal(tricks.state.ground,null);
  tricks.setGround(0,-1,true);tricks.setGround(0,-1,false);assert.equal(tricks.state.ground,null);
  tricks.setGround(0,1,true);tricks.reset();assert.equal(tricks.state.ground,null);
});

test('manuals pivot on the correct wheels, keep both soles planted, and ease out on release',()=>{
  for(const manual of [-1,1]) {
    const visual=createSkaterVisual();
    const groundTrick:GroundTrick={name:'Manual',manual,grab:null};
    visual.setPose({...base,groundTrick});
    assert.ok(Math.abs(visual.board.rotation.x)<0.04,'manual must ease in');
    for(let i=0;i<120;i++)visual.setPose({...base,groundTrick});
    visual.root.updateMatrixWorld(true);
    assert.ok(Math.abs(visual.board.rotation.x-manual*0.22)<0.0001);
    for(const wheel of visual.wheels) {
      const center=wheel.getWorldPosition(new THREE.Vector3());
      if(Math.sign(wheel.position.z)===manual) assert.ok(Math.abs(center.y-BOARD.wheelY)<1e-7,'supporting axle moved');
      else assert.ok(center.y>BOARD.wheelY+0.1,'opposite wheels should lift');
    }
    assertPlanted(visual);
    for(let i=0;i<150;i++)visual.setPose(base);
    assert.ok(visual.board.quaternion.angleTo(new THREE.Quaternion())<0.0001);
    assert.ok(visual.board.position.length()<0.0001);
    visual.setPose({...base,groundTrick});visual.resetPose();
    assert.equal(visual.board.position.length(),0);assert.ok(Math.abs(visual.board.rotation.x)<1e-8);
  }
});

test('Down balances on the rear wheels and Up on the front wheels even riding switch',()=>{
  for(const yaw of [0,Math.PI/3,-Math.PI/3,2*Math.PI/3,-2*Math.PI/3,Math.PI]) for(const dy of [-1,1]) {
    const visual=createSkaterVisual(),tricks=createTrickSystem();visual.root.rotation.y=yaw;
    const boardForward=forward.clone().applyAxisAngle(up,yaw);
    const travelSide=boardForward.dot(forward)<0 ? -1 : 1;
    const facing=screenGrabFacing(boardForward,forward,up);
    tricks.setGround(0,dy,true,facing,1);
    assert.equal(tricks.state.ground?.name,dy>0?'Manual':'Nose Manual');
    for(let i=0;i<120;i++)visual.setPose({...base,groundTrick:tricks.state.ground,travelSide});
    visual.root.updateMatrixWorld(true);
    for(const wheel of visual.wheels) {
      const center=wheel.getWorldPosition(new THREE.Vector3());
      const inFront=center.dot(forward)>0;
      const shouldSupport=dy<0 ? inFront : !inFront;
      if(shouldSupport)assert.ok(Math.abs(center.y-BOARD.wheelY)<1e-7,`${yaw}: wrong supporting wheels for ${tricks.state.ground?.name}`);
      else assert.ok(center.y>BOARD.wheelY+0.1,'opposite axle should lift');
    }
    assertPlanted(visual);
    tricks.setGround(0,0,true,facing,2);
    for(let i=0;i<150;i++)visual.setPose({...base,groundTrick:tricks.state.ground,travelSide});
    assert.ok(visual.board.quaternion.angleTo(new THREE.Quaternion())<0.0001);
  }
});

function assertPlanted(visual:ReturnType<typeof createSkaterVisual>) {
  for(const side of [-1,1]) {
    const foot=visual.root.getObjectByName(`foot-${side}`)!;
    for(const z of [0,-0.1]) {
      const sole=visual.deck.worldToLocal(foot.localToWorld(new THREE.Vector3(0,BOARD.soleBottom,z)));
      assert.ok(Math.abs(sole.y-BOARD.gripY)<1e-6,'sole must stay flat on grip');
    }
    const shin=visual.root.getObjectByName(`shin-${side}`)!;
    assert.ok(shin.localToWorld(new THREE.Vector3(0,0.5,0)).distanceTo(foot.localToWorld(new THREE.Vector3(0,0.06,0)))<0.001,'ankle detached');
  }
}

test('riding grabs reach the deck without lifting wheels or detaching feet, including while carving',()=>{
  for(const grab of [GRABS.indy,GRABS.melon,GRABS.nosegrab,GRABS.tailgrab]) for(const lean of [-1,0,1]) {
    const visual=createSkaterVisual();
    const groundTrick:GroundTrick={name:grab.name,manual:0,grab};
    for(let i=0;i<180;i++)visual.setPose({...base,lean,carve:lean,groundTrick});
    visual.root.updateMatrixWorld(true);
    assert.equal(visual.board.position.length(),0);assert.ok(Math.abs(visual.board.rotation.x)<1e-8);
    for(const wheel of visual.wheels)assert.equal(wheel.getWorldPosition(new THREE.Vector3()).y,BOARD.wheelY);
    const hand=visual.root.getObjectByName(`hand-${grab.hand}`)!.getWorldPosition(new THREE.Vector3());
    const target=visual.deck.localToWorld(new THREE.Vector3(grab.grip.x,grab.grip.y,grab.grip.z).applyAxisAngle(up,RIDER.stanceY));
    assert.ok(hand.distanceTo(target)<0.025,`${grab.id}, lean ${lean}: hand missed by ${hand.distanceTo(target)}`);
    assertPlanted(visual);
    visual.setPose({...base,airborne:true});assert.equal(visual.board.position.length(),0);
  }
});
