import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { solveLimb, solveArm, createRiderMotion } from '../src/player/pose.ts';
import { createSkaterVisual } from '../src/player/skaterVisual.ts';
import { BOARD, FOOT_Y, RIDER } from '../src/player/dimensions.ts';
import { GRABS } from '../src/player/grabs.ts';

const base = { dt: 1 / 120, speed: 25, push: 0, verticalSpeed: 0, grinding: false,
  crouch: 0, lean: 0, airborne: false, bail: false, wheelRoll: 0, boardSpin: { x: 0, y: 0, z: 0 } };

test('regular stance plants the left foot toward the nose and keeps nose/tail tweaks correctly directed',()=>{
  const visual=createSkaterVisual();
  for(let frame=0;frame<120;frame++)visual.setPose(base);
  visual.root.updateMatrixWorld(true);
  const left=visual.board.worldToLocal(visual.root.getObjectByName('foot--1')!.getWorldPosition(new THREE.Vector3()));
  const right=visual.board.worldToLocal(visual.root.getObjectByName('foot-1')!.getWorldPosition(new THREE.Vector3()));
  assert.ok(left.z<-0.2 && right.z>0.2,'left foot must lead down the board');
  for(const grab of [GRABS.nosebone,GRABS.tailbone]) {
    for(let frame=0;frame<180;frame++)visual.setPose({...base,airborne:true,grab});
    assert.ok(grab.id==='nosebone' ? visual.board.position.z<0 : visual.board.position.z>0);
  }
});

test('heads turn with full aerial spins instead of counter-rotating toward the course',()=>{
  for(const mode of ['skate','snowboard'] as const)for(const grab of [null,GRABS.pushout,GRABS.nosebone,GRABS.tomahawk]) {
    const visual=createSkaterVisual(mode),head=visual.root.getObjectByName('head')!;
    const pose={...base,airborne:true,grab,headForward:new THREE.Vector3(0,0,-1)};
    for(let frame=0;frame<180;frame++)visual.setPose(pose);
    const neck=head.quaternion.clone(),initial=new THREE.Vector3(0,0,-1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    for(let frame=0;frame<=240;frame++) {
      visual.root.rotation.y=frame/240*Math.PI*2;visual.setPose(pose);
      assert.ok(neck.angleTo(head.quaternion)<0.002,'neck counter-rotated during the spin');
      if(frame===120) {
        const facing=new THREE.Vector3(0,0,-1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
        assert.ok(facing.dot(initial)<-0.999,'the head should turn through the 180 with the rider');
      }
    }
  }
});

test('riding glances stay comfortable and ease to the opposite shoulder after landing switch',()=>{
  const visual=createSkaterVisual(),head=visual.root.getObjectByName('head')!,course=new THREE.Vector3(0,0,-1);
  for(let frame=0;frame<180;frame++)visual.setPose({...base,headForward:course,travelSide:1});
  const normalYaw=new THREE.Euler().setFromQuaternion(head.quaternion,'YXZ').y;
  visual.root.rotation.y=Math.PI;
  for(let frame=0;frame<120;frame++)visual.setPose({...base,airborne:true,headForward:course});
  assert.ok(Math.abs(new THREE.Euler().setFromQuaternion(head.quaternion,'YXZ').y-normalYaw)<0.00001,'airborne heading should not counter-rotate the neck');
  for(let frame=0;frame<180;frame++) {
    const before=head.quaternion.clone();visual.setPose({...base,headForward:course,travelSide:-1});
    const neck=new THREE.Euler().setFromQuaternion(head.quaternion,'YXZ');
    assert.ok(Math.abs(neck.y)<=1.05 && Math.abs(neck.x)<=0.22 && Math.abs(neck.z)<=0.13,'head exceeded comfortable neck angles');
    assert.ok(before.angleTo(head.quaternion)<0.13,'head snapped on landing');
  }
  assert.ok(new THREE.Euler().setFromQuaternion(head.quaternion,'YXZ').y<-0.6,'switch riding should glance over the opposite shoulder');
  const facing=new THREE.Vector3(0,0,-1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(facing.dot(course)>0.55,'normal riding should retain a gentle look toward travel');
});

test('backward grabs keep a relaxed neck through spins and release without a 180-degree twist',()=>{
  const visual=createSkaterVisual(),head=visual.root.getObjectByName('head')!;
  const pose={...base,airborne:true,grab:GRABS.tomahawk,headForward:new THREE.Vector3(0,0,-1)};
  visual.setPose({...pose,grab:null});
  for(let frame=0;frame<180;frame++) {
    const before=head.quaternion.clone();visual.setPose(pose);
    assert.ok(before.angleTo(head.quaternion)<0.05,'head snapped into the grab');
  }
  const held=head.quaternion.clone();
  for(let frame=0;frame<120;frame++) {
    visual.root.rotation.y=(frame+1)/120*Math.PI;visual.setPose(pose);
    assert.ok(held.angleTo(head.quaternion)<0.00001,'head twisted independently of the grab');
  }
  for(let frame=0;frame<180;frame++)visual.setPose({...pose,grab:null});
  const neck=new THREE.Euler().setFromQuaternion(head.quaternion,'YXZ');
  assert.ok(Math.abs(neck.y-0.65)<0.00001 && Math.abs(neck.x)<0.22,'release must retain a comfortable local neck pose');
});

test('knees bend forward and elbows back with constant bone lengths and no overextension', () => {
  for (const side of [-1, 1]) for (const drop of [0, 0.1, 0.22]) {
    const hip = new THREE.Vector3(side * 0.095, 0.73 - drop, 0.03 + drop * 0.4);
    const ankle = new THREE.Vector3(side * 0.255, FOOT_Y + 0.06, 0);
    const leg = solveLimb(hip, ankle, new THREE.Vector3(0, 0, -1), 0.38, 0.38);
    assert.ok(Math.abs(hip.distanceTo(leg.joint) - 0.38) < 1e-8);
    assert.ok(Math.abs(leg.joint.distanceTo(leg.end) - 0.38) < 1e-8);
    assert.ok(leg.joint.z < hip.clone().lerp(ankle, 0.5).z);
    assert.ok(leg.end.distanceTo(ankle) < 1e-8);
    const shoulder = new THREE.Vector3(side * 0.17, 0.36, 0);
    const wrist = new THREE.Vector3(side * 0.28, 0.1, -0.2);
    const arm = solveArm(shoulder, wrist, side);
    assert.ok(Math.abs(shoulder.distanceTo(arm.joint) - 0.25) < 1e-8);
    assert.ok(Math.abs(arm.joint.distanceTo(arm.end) - 0.24) < 1e-8);
    assert.ok(arm.joint.z > shoulder.clone().lerp(wrist, 0.5).z);
    assert.ok(arm.end.z < arm.joint.z, "forearm must fold forward from the elbow");
  }
  const stretched = solveLimb(new THREE.Vector3(), new THREE.Vector3(0, -5, 0), new THREE.Vector3(0, 0, -1), 0.38, 0.38);
  assert.ok(stretched.end.length() < 0.76);
});

test('crouching and leaning keep both soles on the grip without rolling the wheels', () => {
  const visual = createSkaterVisual();
  for (const crouch of [0, 0.5, 1]) for (const lean of [-1, 0, 1]) {
    for (let i = 0; i < 120; i++) visual.setPose({ ...base, crouch, lean });
    visual.root.updateMatrixWorld(true);
    for (const side of [-1, 1]) {
      const foot = visual.root.getObjectByName(`foot-${side}`)!;
      const sole = foot.localToWorld(new THREE.Vector3(0, BOARD.soleBottom, 0));
      assert.ok(Math.abs(sole.y - BOARD.gripY) < 1e-8, `sole lifted: ${sole.y}`);
    }
    assert.equal(visual.board.rotation.z, 0);
    for (const wheel of visual.wheels) assert.equal(wheel.position.y, BOARD.wheelY);
  }
});

test('pose transitions soften crouching and absorb landings before recovering', () => {
  const motion = createRiderMotion();
  motion.update(1 / 120, 1, 1, false, 0, 0);
  assert.ok(motion.state.crouch > 0 && motion.state.crouch < 0.2);
  motion.update(1 / 120, 0, 0, true, 0, -8);
  motion.update(1 / 120, 0, 0, false, 0, 0);
  const impact = motion.state.landing; assert.ok(impact > 0.05);
  for (let i = 0; i < 120; i++) motion.update(1 / 120, 0, 0, false, 0, 0);
  assert.ok(motion.state.landing < 0.001);
  motion.reset(); assert.equal(motion.state.landing, 0);
});

test('animated pushing and weight shifts keep shins connected to the ankles', () => {
  const visual = createSkaterVisual();
  for (let i = 0; i < 1440; i++) {
    visual.setPose({ ...base, speed: 8, push: 1, lean: Math.sin(i * 0.02), wheelRoll: i * 2 });
    visual.root.updateMatrixWorld(true);
    for (const side of [-1, 1]) {
      const foot = visual.root.getObjectByName(`foot-${side}`)!;
      const shin = visual.root.getObjectByName(`shin-${side}`)!;
      const ankle = foot.localToWorld(new THREE.Vector3(0, 0.06, 0));
      const shinEnd = shin.localToWorld(new THREE.Vector3(0, 0.5, 0));
      assert.ok(ankle.distanceTo(shinEnd) < 1e-6, `shin disconnected by ${ankle.distanceTo(shinEnd)}`);
    }
  }
});

test('both animated elbows stay behind the wrist path and connected through every stance', () => {
  const visual = createSkaterVisual();
  for (const pose of [base, { ...base, crouch: 1 }, { ...base, speed: 8, push: 1 },
    { ...base, airborne: true }, { ...base, grinding: true }, { ...base, lean: -1 }, { ...base, lean: 1 }]) {
    for (let i = 0; i < 240; i++) {
      visual.setPose(pose);
      for (const side of [-1, 1]) {
        const upper = visual.root.getObjectByName(`upper-arm-${side}`)!;
        const fore = visual.root.getObjectByName(`forearm-${side}`)!;
        const elbow = visual.root.getObjectByName(`elbow-${side}`)!;
        const hand = visual.root.getObjectByName(`hand-${side}`)!;
        const endpoint = (mesh: THREE.Object3D, y: number) =>
          new THREE.Vector3(0, y, 0).multiply(mesh.scale).applyQuaternion(mesh.quaternion).add(mesh.position);
        const shoulder = endpoint(upper, -0.5);
        const wrist = hand.position;
        const axis = wrist.clone().sub(shoulder).normalize();
        const elbowOffset = elbow.position.clone().sub(shoulder);
        elbowOffset.addScaledVector(axis, -elbowOffset.dot(axis));
        assert.ok(elbowOffset.z > 0, `elbow ${side} bent forward`);
        assert.ok(wrist.z < elbow.position.z, `forearm ${side} folded backward`);
        assert.ok(endpoint(upper, 0.5).distanceTo(elbow.position) < 1e-8);
        assert.ok(endpoint(fore, -0.5).distanceTo(elbow.position) < 1e-8);
        assert.ok(endpoint(fore, 0.5).distanceTo(wrist) < 1e-8);
      }
    }
  }
});


test('resting arms hang low with soft elbows in both board modes',()=>{
  for(const mode of ['skate','snowboard'] as const) for(const airborne of [false,true]) {
    const visual=createSkaterVisual(mode);
    for(let i=0;i<120;i++)visual.setPose({...base,airborne});
    for(const side of [-1,1]) {
      const hand=visual.root.getObjectByName(`hand-${side}`)!,torso=hand.parent!;
      const shoulder=new THREE.Vector3(side*0.17,0.36,0),reach=hand.position.distanceTo(shoulder);
      assert.ok(reach>0.47 && reach<0.48,`resting elbow should be softly extended: ${reach}`);
      assert.ok(hand.position.y<shoulder.y-0.35,'resting hands should hang below the shoulders');
      const elbow=torso.getObjectByName(`elbow-${side}`)!;
      assert.ok(Math.abs(shoulder.distanceTo(elbow.position)-0.25)<1e-6);
      assert.ok(Math.abs(elbow.position.distanceTo(hand.position)-0.24)<1e-6);
    }
  }
});

test('shorter leg proportions keep each visible bone at the configured length', () => {
  assert.ok(RIDER.upperLeg + RIDER.lowerLeg < 0.7);
  const visual = createSkaterVisual();
  for (let i = 0; i < 120; i++) visual.setPose(base);
  for (const side of [-1, 1]) {
    const shin = visual.root.getObjectByName(`shin-${side}`)!;
    assert.ok(Math.abs(shin.scale.y - RIDER.lowerLeg) < 1e-8);
  }
  for(const mode of ['skate','snowboard'] as const) {
    visual.setMode(mode);
    let meshCount = 0; visual.root.traverseVisible(obj => { if (obj instanceof THREE.Mesh) meshCount++; });
    assert.ok(meshCount < 55, `too many rendered rider meshes in ${mode}: ${meshCount}`);
  }
});
