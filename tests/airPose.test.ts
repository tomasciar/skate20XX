import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createAirPose} from '../src/player/airPose.ts';
import {createSkaterVisual} from '../src/player/skaterVisual.ts';
import {GRABS} from '../src/player/grabs.ts';
import {BOARD,RIDER} from '../src/player/dimensions.ts';

const input={dt:1/120,active:true,verticalSpeed:8,turn:0,pitch:0,roll:0,travelSide:1};
const pose={dt:1/120,speed:25,push:0,verticalSpeed:0,grinding:false,crouch:0,lean:0,airborne:true,bail:false,
  wheelRoll:0,boardSpin:{x:0,y:0,z:0}};

test('air arm balance follows takeoff, apex and descent without repeating the takeoff sweep',()=>{
  const air=createAirPose();air.update(input);assert.ok(air.state.launch>.8);
  for(let frame=0;frame<60;frame++)air.update(input);
  assert.ok(air.state.lift>.7&&air.state.descent===0);assert.ok(air.state.launch<.1);
  for(let frame=0;frame<90;frame++)air.update({...input,verticalSpeed:0});
  assert.ok(air.state.lift<.01&&air.state.descent===0);
  for(let frame=0;frame<90;frame++)air.update({...input,verticalSpeed:-14});
  assert.ok(air.state.descent>.98&&air.state.launch<.001);
  for(let frame=0;frame<90;frame++)air.update({...input,active:false});
  assert.ok(air.state.weight<.001&&air.state.descent<.02);
});

test('falling spawns do not fake a takeoff; paused paints and resets do not leave stale flight inputs',()=>{
  const air=createAirPose();air.update({...input,verticalSpeed:-10});assert.equal(air.state.launch,0);
  const before={...air.state};air.update({...input,dt:0,turn:1,pitch:1,roll:1});assert.deepEqual(air.state,before);
  for(let frame=0;frame<90;frame++)air.update({...input,turn:1,pitch:-1,roll:.5});
  assert.ok(air.state.turn>.9&&air.state.pitch<-.9&&air.state.roll>.45);
  air.reset();air.update({...input,dt:0,active:false});
  assert.equal(air.state.weight,0);assert.equal(air.state.turn,0);assert.equal(air.state.pitch,0);assert.equal(air.state.roll,0);
});

test('air balance reacts consistently at 30, 60 and 120 fps',()=>{
  const simulate=(fps:number)=>{
    const air=createAirPose();air.update({...input,dt:0});
    for(let frame=1;frame<=fps*2;frame++) {
      const t=frame/fps;air.update({...input,dt:1/fps,verticalSpeed:10-t*12,turn:Math.sin(t)*.6,pitch:.5,roll:-.3});
    }
    return {...air.state};
  };
  const reference=simulate(120);
  for(const fps of [30,60])for(const [key,value] of Object.entries(simulate(fps)))
    assert.ok(Math.abs(value-reference[key as keyof typeof reference])<.025,`${key}: render-rate dependent air motion`);
});

function assertConnected(visual:ReturnType<typeof createSkaterVisual>) {
  visual.root.updateMatrixWorld(true);
  for(const side of [-1,1]) {
    const upper=visual.root.getObjectByName(`upper-arm-${side}`)!,fore=visual.root.getObjectByName(`forearm-${side}`)!;
    const elbow=visual.root.getObjectByName(`elbow-${side}`)!,hand=visual.root.getObjectByName(`hand-${side}`)!;
    assert.ok(upper.localToWorld(new THREE.Vector3(0,.5,0)).distanceTo(elbow.getWorldPosition(new THREE.Vector3()))<1e-6);
    assert.ok(fore.localToWorld(new THREE.Vector3(0,.5,0)).distanceTo(hand.getWorldPosition(new THREE.Vector3()))<1e-6);
    const foot=visual.root.getObjectByName(`foot-${side}`)!;
    const sole=visual.board.worldToLocal(foot.localToWorld(new THREE.Vector3(0,BOARD.soleBottom,0)));
    assert.ok(Math.abs(sole.y-BOARD.gripY)<1e-6,'arm balance must not alter planted feet');
  }
}

test('airborne hands visibly change between rising, apex, descent and spin without disconnecting arms',()=>{
  for(const mode of ['skate','snowboard'] as const) {
    const visual=createSkaterVisual(mode),samples:THREE.Vector3[][]=[];
    for(const phase of [{verticalSpeed:8},{verticalSpeed:0},{verticalSpeed:-14},{verticalSpeed:-8,lean:1,flipLean:{pitch:.5,roll:.6}}]) {
      for(let frame=0;frame<90;frame++){visual.setPose({...pose,...phase});assertConnected(visual);}
      samples.push([-1,1].map(side=>visual.root.getObjectByName(`hand-${side}`)!.position.clone()));
    }
    const difference=(a:number,b:number)=>samples[a]!.reduce((sum,hand,index)=>sum+hand.distanceTo(samples[b]![index]!),0)/2;
    assert.ok(difference(0,1)>.05,'rising and apex arm poses should read differently');
    assert.ok(difference(2,1)>.04,'descent should open the arms again');
    assert.ok(difference(3,2)>.04,'rotation should create asymmetric counterbalance');
  }
});

test('a grabbed hand remains locked while the free hand reacts to changing flight and flip inputs',()=>{
  for(const mode of ['skate','snowboard'] as const)for(const grab of [GRABS.tomahawk,GRABS.pushout,GRABS.nosebone,GRABS.tailbone]) {
    const visual=createSkaterVisual(mode);
    for(let frame=0;frame<180;frame++)visual.setPose({...pose,verticalSpeed:8,grab});
    const free=visual.root.getObjectByName(`hand-${-grab.hand}`)!,before=free.position.clone();
    for(let frame=0;frame<120;frame++)visual.setPose({...pose,verticalSpeed:-14,lean:1,flipLean:{pitch:.5,roll:.4},grab});
    assertConnected(visual);
    const target=visual.board.localToWorld(new THREE.Vector3(grab.grip.x,grab.grip.y,grab.grip.z).applyAxisAngle(new THREE.Vector3(0,1,0),RIDER.stanceY));
    const hand=visual.root.getObjectByName(`hand-${grab.hand}`)!.getWorldPosition(new THREE.Vector3());
    assert.ok(hand.distanceTo(target)<.025,`${grab.id}: air balance displaced the held grip`);
    assert.ok(free.position.distanceTo(before)>.04,'the free hand should keep balancing during a grab');
  }
});
