import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createInput } from '../src/input.ts';
import { createController } from '../src/player/controller.ts';
import { classifyGrab, GRABS, screenGrabFacing } from '../src/player/grabs.ts';
import { createTrickSystem } from '../src/player/tricks.ts';
import { createSkaterVisual } from '../src/player/skaterVisual.ts';
import { BOARD, RIDER } from '../src/player/dimensions.ts';

test('plain arrows hold grabs and Shift switches to board tricks without changing movement', () => {
  const events = new EventTarget(); Object.assign(globalThis, { window: events });
  const input = createInput(), controller = createController();
  const key = (type: string, code: string) => events.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
  key('keydown', 'KeyW'); key('keydown', 'KeyD');
  key('keydown', 'ArrowUp'); input.beginFrame();
  let intent = controller.update(input.state, 1 / 120);
  assert.equal(intent.push, 1); assert.equal(intent.steer, 1);
  assert.equal(intent.grabModifier, true); assert.equal(intent.grabDY, -1); assert.equal(intent.flickReady, false);
  input.consume(); input.beginFrame();
  assert.equal(input.state.grabDY, -1, 'held grab must survive physics consumption');
  key('keydown', 'ShiftLeft');input.beginFrame();intent=controller.update(input.state,1/120);
  assert.equal(intent.grabModifier,false);assert.equal(intent.grabDY,0);assert.equal(intent.flickReady,true);
  input.consume();
  key('keydown', 'ShiftRight'); key('keyup', 'ShiftLeft'); input.beginFrame(); assert.ok(input.state.trickModifier);
  assert.equal(input.state.flickReady,false,'a second Shift key must not trigger another trick');
  key('keyup', 'ShiftRight'); input.beginFrame(); intent = controller.update(input.state, 1 / 120);
  assert.equal(intent.grabModifier, true); assert.equal(intent.grabDY, -1); assert.equal(intent.flickReady, false);
  key('keyup', 'ArrowUp'); key('keydown', 'ArrowLeft'); input.beginFrame();
  assert.equal(input.state.flickReady, false);
  key('keydown', 'ShiftLeft'); events.dispatchEvent(new Event('blur'));
  assert.equal(input.state.trickModifier, false); assert.equal(input.state.grabDX, 0);
  input.dispose(); delete (globalThis as Record<string, unknown>).window;
});

test('grab selection and lifecycle require air and never overlap flip tricks', () => {
  assert.equal(classifyGrab(0,-1)?.id, 'nosebone'); assert.equal(classifyGrab(0,1)?.id, 'tailbone');
  assert.equal(classifyGrab(-1,0)?.id, 'tomahawk'); assert.equal(classifyGrab(1,0)?.id, 'pushout');
  assert.equal(classifyGrab(0,0), null);
  const tricks = createTrickSystem();
  tricks.setGrab(1,0,true,false); assert.equal(tricks.state.grab, null);
  tricks.setGrab(1,0,true,true); assert.equal(tricks.state.grab?.id, 'pushout');
  tricks.tryFlick(-80,0,true); assert.equal(tricks.state.active, null);
  tricks.update(0.5,false,1,20); assert.equal(tricks.state.message, 'Push-Out Grab');
  assert.ok(tricks.state.grabTime > 0);
  tricks.setGrab(1,0,false,true); assert.equal(tricks.state.grab, null);
  tricks.tryFlick(-80,0,true); assert.ok(tricks.state.active);
  tricks.setGrab(1,0,true,true); assert.equal(tricks.state.grab, null);
  tricks.reset(); tricks.setGrab(0,-1,true,true); tricks.update(0.01,true,1,20);
  assert.equal(tricks.state.grab, null); assert.equal(tricks.state.lastLanded, 'Nosebone Grab');
  tricks.setGrab(0,-1,true,true); tricks.reset(); assert.equal(tricks.state.grab, null);
});

test('all grab hands reach the board with tucked feet, and landing restores wheel contact height', () => {
  for (const grab of Object.values(GRABS)) for (const lean of [-1,0,1]) {
    const visual = createSkaterVisual();
    const pose = { dt: 1 / 120, speed: 25, push: 0, verticalSpeed: -1, grinding: false,
      crouch: 0, lean, airborne: true, bail: false, wheelRoll: 0,
      boardSpin: { x: 0, y: 0, z: 0 }, grab };
    for (let i = 0; i < 240; i++) visual.setPose(pose);
    visual.root.updateMatrixWorld(true);
    const hand = visual.root.getObjectByName(`hand-${grab.hand}`)!;
    const actual = hand.getWorldPosition(new THREE.Vector3());
    // Convert the left-foot-forward rider grip into board space.
    const expected = visual.board.localToWorld(new THREE.Vector3(grab.grip.x,grab.grip.y,grab.grip.z).applyAxisAngle(new THREE.Vector3(0,1,0),RIDER.stanceY));
    assert.ok(actual.distanceTo(expected) < 0.025, `${grab.name} hand missed by ${actual.distanceTo(expected)}`);
    assert.ok(visual.board.position.y > 0.15);
    for (const side of [-1,1]) {
      const foot = visual.root.getObjectByName(`foot-${side}`)!;
      const sole = foot.localToWorld(new THREE.Vector3(0,BOARD.soleBottom,0));
      assert.ok(Math.abs(visual.board.worldToLocal(sole).y-BOARD.gripY)<1e-6);
      const shin=visual.root.getObjectByName(`shin-${side}`)!;
      const end=shin.localToWorld(new THREE.Vector3(0,0.5,0));
      const ankle=foot.localToWorld(new THREE.Vector3(0,0.06,0));
      assert.ok(end.distanceTo(ankle)<0.001,`${grab.name} leg stretched by ${end.distanceTo(ankle)}`);
    }
    visual.setPose({ ...pose, airborne: false, grab: null });
    assert.equal(visual.board.position.y, 0, 'board must be on its wheels immediately on landing');
    visual.resetPose(); assert.equal(visual.board.position.y, 0);
  }
});


test('press-selected grabs survive full spins without switching poses or resetting their timer',()=>{
  for (const [dx,dy,id] of [[-1,0,'tomahawk'],[1,0,'pushout'],[0,-1,'nosebone'],[0,1,'tailbone']] as const) {
    const tricks=createTrickSystem(), visual=createSkaterVisual();
    let previousTime=0;
    for(let frame=0;frame<180;frame++) {
      visual.root.rotation.y=frame/179*Math.PI*4;
      const up=new THREE.Vector3(0,1,0),course=new THREE.Vector3(0,0,-1);
      const forward=course.clone().applyAxisAngle(up,visual.root.rotation.y);
      tricks.setGrab(dx,dy,true,true,screenGrabFacing(forward,course,up),1);tricks.update(1/120,false,1,30);
      assert.equal(tricks.state.grab?.id,id);
      assert.ok(tricks.state.grabTime>previousTime);previousTime=tricks.state.grabTime;
      visual.setPose({dt:1/120,speed:30,push:0,verticalSpeed:0,grinding:false,crouch:0,lean:0,
        airborne:true,bail:false,wheelRoll:0,boardSpin:{x:0,y:0,z:0},grab:tricks.state.grab});
    }
    assert.ok(tricks.state.grabTime>1.49);
  }
});

test('backward grab keeps the deck outside the chest through its blend and hold',()=>{
  for(const lean of [-1,0,1]) {
    const visual=createSkaterVisual();
    const chest=visual.root.getObjectByName('chest')!;
    for(let frame=0;frame<180;frame++) {
      visual.setPose({dt:1/120,speed:35,push:0,verticalSpeed:0,grinding:false,crouch:0,lean,
        airborne:true,bail:false,wheelRoll:0,boardSpin:{x:0,y:0,z:0},grab:GRABS.tomahawk});
      visual.root.updateMatrixWorld(true);
      for(const x of [-0.10,0,0.10]) for(let z=-0.38;z<=0.38;z+=0.038) {
        const point=chest.worldToLocal(visual.board.localToWorld(new THREE.Vector3(x,0.01,z)));
        // Conservative cylinder enclosing the shirt mesh, including its deepest side.
        assert.ok(Math.abs(point.y)>0.19 || Math.hypot(point.x,point.z)>0.17,
          `deck penetrates chest at frame ${frame}, lean ${lean}`);
      }
    }
  }
});


test('arrow direction is resolved from facing on press and recalculated after release/repress',()=>{
  const up=new THREE.Vector3(0,1,0),course=new THREE.Vector3(0,0,-1);
  const leftFacing=screenGrabFacing(course.clone().negate(),course,up);
  const rightFacing=screenGrabFacing(course,course,up);
  assert.equal(classifyGrab(-1,0,leftFacing)?.id,'pushout');
  assert.equal(classifyGrab(1,0,leftFacing)?.id,'tomahawk');
  assert.equal(classifyGrab(-1,0,rightFacing)?.id,'tomahawk');
  assert.equal(classifyGrab(1,0,rightFacing)?.id,'pushout');
  const quarter=screenGrabFacing(new THREE.Vector3(1,0,0),course,up);
  assert.equal(classifyGrab(0,-1,quarter)?.id,'tomahawk');
  assert.equal(classifyGrab(0,1,quarter)?.id,'pushout');
  assert.equal(classifyGrab(1,0,quarter)?.id,'nosebone');
  assert.equal(classifyGrab(-1,0,quarter)?.id,'tailbone');
  const tricks=createTrickSystem();
  tricks.setGrab(-1,0,true,true,leftFacing,1);assert.equal(tricks.state.grab?.id,'pushout');
  tricks.update(0.3,false,1,20);
  tricks.setGrab(-1,0,true,true,rightFacing,1);assert.equal(tricks.state.grab?.id,'pushout');
  assert.equal(tricks.state.grabTime,0.3);
  tricks.setGrab(0,0,true,true,rightFacing,1);assert.equal(tricks.state.grab,null);
  tricks.setGrab(-1,0,true,true,rightFacing,2);assert.equal(tricks.state.grab?.id,'tomahawk');
  // A quick release and re-press between physics steps still counts as a new press.
  tricks.setGrab(-1,0,true,true,leftFacing,3);assert.equal(tricks.state.grab?.id,'pushout');
  assert.equal(tricks.state.grabTime,0);
});

test('a quick arrow re-press survives input frame consumption without leaking a flip',()=>{
  const events=new EventTarget();Object.assign(globalThis,{window:events});
  const input=createInput(),controller=createController();
  const key=(type:string,code:string,repeat=false)=>events.dispatchEvent(Object.assign(new Event(type),{code,repeat}));
  key('keydown','ArrowLeft');input.beginFrame();
  const first=controller.update(input.state,1/120);assert.ok(first.grabPress!>0);
  input.consume();input.beginFrame();assert.equal(input.state.grabPress,first.grabPress);
  key('keydown','ArrowLeft',true);assert.equal(input.state.grabPress,first.grabPress);
  key('keyup','ArrowLeft');key('keydown','ArrowLeft');input.beginFrame();
  const second=controller.update(input.state,1/120);
  assert.equal(second.grabDX,-1);assert.ok(second.grabPress!>first.grabPress!);assert.equal(second.flickReady,false);
  input.dispose();delete (globalThis as Record<string,unknown>).window;
});

test('Shift arrow tricks preserve quick taps, diagonals and one-shot consumption without grabbing',()=>{
  const events=new EventTarget();Object.assign(globalThis,{window:events});
  const input=createInput(),controller=createController(),tricks=createTrickSystem();
  const key=(type:string,code:string,repeat=false)=>events.dispatchEvent(Object.assign(new Event(type),{code,repeat}));
  try {
    key('keydown','ShiftLeft');key('keydown','ArrowUp');key('keydown','ArrowLeft');
    key('keyup','ShiftLeft');key('keyup','ArrowUp');key('keyup','ArrowLeft');
    input.beginFrame();input.beginFrame();
    const intent=controller.update(input.state,1/120,true);
    assert.equal(intent.flickReady,true);assert.equal(intent.flickDX,-80);assert.equal(intent.flickDY,-80);
    assert.equal(intent.grabModifier,false);
    tricks.setGrab(intent.grabDX,intent.grabDY,intent.grabModifier,true);
    tricks.tryFlick(intent.flickDX,intent.flickDY,true);
    assert.equal(tricks.state.grab,null);assert.equal(tricks.state.active?.id,'varial');
    input.consume();input.beginFrame();assert.equal(controller.update(input.state,1/120,true).flickReady,false);
    key('keydown','ShiftRight');key('keydown','ArrowLeft');input.beginFrame();input.consume();
    key('keydown','ArrowLeft',true);input.beginFrame();assert.equal(input.state.flickReady,false);
  } finally {input.dispose();delete (globalThis as Record<string,unknown>).window;}
});

test('backward grab folds knees below the hips and retains the chest in the crash rig',()=>{
  for(const lean of [-1,0,1]) {
    const visual=createSkaterVisual();
    for(let frame=0;frame<360;frame++) {
      visual.setPose({dt:1/120,speed:35,push:0,verticalSpeed:0,grinding:false,crouch:0,lean,
        airborne:true,bail:false,wheelRoll:0,boardSpin:{x:0,y:0,z:0},grab:frame<180?GRABS.tomahawk:null});
      const rig=visual.captureRagdoll(),pelvis=rig.parts.find(p=>p.id==='pelvis')!;
      for(const side of [-1,1]) {
        const knee=visual.root.getObjectByName(`knee-${side}`)!.getWorldPosition(new THREE.Vector3());
        assert.ok(knee.y<pelvis.center.y-0.06,`knee folded above hip at frame ${frame}, lean ${lean}`);
        assert.ok(visual.board.worldToLocal(knee.clone()).y>BOARD.gripY,
          `leg approaches the underside of the deck at frame ${frame}, lean ${lean}`);
      }
      assert.ok(rig.parts.find(p=>p.id==='torso')!.objects.includes(visual.root.getObjectByName('chest')!));
    }
  }
});
