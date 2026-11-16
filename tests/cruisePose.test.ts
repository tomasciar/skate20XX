import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCruisePose} from '../src/player/cruisePose.ts';
import {createSkaterVisual} from '../src/player/skaterVisual.ts';
import {CHARACTERS} from '../src/characters.ts';
import {BOARD} from '../src/player/dimensions.ts';

const input={dt:1/120,active:true,speed:25,turn:0,surfacePitch:-.2,travelSide:1 as const};
const pose={dt:1/120,speed:25,push:0,verticalSpeed:0,grinding:false,crouch:0,lean:0,airborne:false,bail:false,
  wheelRoll:0,boardSpin:{x:0,y:0,z:0},surfacePitch:-.2};

test('constant coasting has no invented acceleration or terrain pulses, and paused paints do not alter history',()=>{
  const cruise=createCruisePose();
  for(let frame=0;frame<480;frame++)cruise.update(input);
  assert.equal(cruise.state.acceleration,0);assert.equal(cruise.state.compression,0);
  const paused={...cruise.state};cruise.update({...input,dt:0,speed:200,surfacePitch:.7,turn:1});
  assert.deepEqual(cruise.state,paused);
  cruise.update(input);assert.equal(cruise.state.acceleration,0);assert.equal(cruise.state.compression,0);
});

test('turn balance starts at the hips and follows through the chest and arms before settling',()=>{
  const cruise=createCruisePose();cruise.update(input);
  for(let frame=0;frame<12;frame++)cruise.update({...input,turn:1});
  assert.ok(cruise.state.turn>cruise.state.chestTurn&&cruise.state.chestTurn>cruise.state.armTurn);
  assert.ok(cruise.state.armTurn>0);
  for(let frame=0;frame<240;frame++)cruise.update({...input,turn:1});
  assert.ok(cruise.state.armTurn>.99,'a sustained turn should settle instead of repeatedly flapping the arms');
  for(let frame=0;frame<360;frame++)cruise.update(input);
  assert.ok(Math.abs(cruise.state.armTurn)<.001);
});

test('weight reacts to acceleration and grade transitions, then settles on a constant grade',()=>{
  const cruise=createCruisePose();cruise.update(input);
  for(let frame=1;frame<=60;frame++)cruise.update({...input,speed:25+6*frame/120});
  assert.ok(cruise.state.acceleration>.4&&cruise.state.acceleration<.6);
  for(let frame=1;frame<=90;frame++)cruise.update({...input,speed:28-6*frame/120});
  assert.ok(cruise.state.acceleration<-.4);
  for(let frame=1;frame<=30;frame++)cruise.update({...input,speed:23.5,surfacePitch:-.2+frame/120});
  assert.ok(cruise.state.compression>.04&&cruise.state.compression<=.12);
  for(let frame=0;frame<180;frame++)cruise.update({...input,speed:23.5,surfacePitch:.05});
  assert.ok(Math.abs(cruise.state.compression)<.001&&Math.abs(cruise.state.acceleration)<.001);
});

test('air, switch landings, long frame gaps and resets do not masquerade as bumps or speed impulses',()=>{
  const cruise=createCruisePose();cruise.update(input);
  cruise.update({...input,active:false,speed:100,surfacePitch:2});
  cruise.update({...input,speed:70,surfacePitch:.5,travelSide:-1});
  assert.equal(cruise.state.acceleration,0);assert.equal(cruise.state.compression,0);
  cruise.update({...input,dt:.5,speed:180,surfacePitch:1});
  assert.equal(cruise.state.acceleration,0);assert.equal(cruise.state.compression,0);
  for(let frame=0;frame<180;frame++)cruise.update({...input,active:false});
  assert.ok(cruise.state.weight<.0001);
  cruise.reset();cruise.update({...input,dt:0});
  assert.equal(cruise.state.weight,1);assert.equal(cruise.state.acceleration,0);assert.equal(cruise.state.turn,0);
});

test('balance response stays consistent across 30, 60 and 120 fps',()=>{
  const simulate=(fps:number)=>{
    const cruise=createCruisePose();cruise.update(input);
    for(let frame=1;frame<=fps*3;frame++) {
      const t=frame/fps;
      cruise.update({...input,dt:1/fps,speed:25+t*4,turn:Math.sin(t*1.2)*.6,surfacePitch:-.2+t*.08});
    }
    return {...cruise.state};
  };
  const reference=simulate(120);
  for(const fps of [30,60])for(const [key,value] of Object.entries(simulate(fps)))
    assert.ok(Math.abs(value-reference[key as keyof typeof reference])<.025,`${key} changed with render rate ${fps}`);
});

test('wheel animation cannot drive a fake body bob, and a real slope change loads the knees',()=>{
  const coast=createSkaterVisual(),rolling=createSkaterVisual(),loaded=createSkaterVisual();
  for(let frame=0;frame<180;frame++)for(const visual of [coast,rolling,loaded])visual.setPose(pose);
  for(let frame=1;frame<=30;frame++) {
    coast.setPose(pose);rolling.setPose({...pose,wheelRoll:frame*123});
    loaded.setPose({...pose,surfacePitch:-.2+frame/120});
  }
  const hips=(visual:ReturnType<typeof createSkaterVisual>)=>visual.root.getObjectByName('chest')!.parent!.parent!;
  assert.ok(hips(coast).position.distanceTo(hips(rolling).position)<1e-8);
  assert.ok(hips(loaded).position.y<hips(coast).position.y-.008,'knees should absorb a grade transition');
});

test('long coasts visibly redistribute weight and move hips and shoulders independently without vertical bobbing',()=>{
  const visual=createSkaterVisual(),hips=visual.root.getObjectByName('chest')!.parent!.parent!,torso=hips.children.find(child=>child.getObjectByName('chest'))!;
  const samples:{x:number;y:number;hipYaw:number;chestYaw:number;shoulder:number}[]=[];
  for(let frame=0;frame<1200;frame++) {
    visual.setPose(pose);
    if(frame>180)samples.push({x:hips.position.x,y:hips.position.y,hipYaw:hips.rotation.y,chestYaw:torso.rotation.y,
      shoulder:visual.root.getObjectByName('shoulder--1')!.position.y-visual.root.getObjectByName('shoulder-1')!.position.y});
  }
  const range=(key:keyof typeof samples[number])=>Math.max(...samples.map(sample=>sample[key]))-Math.min(...samples.map(sample=>sample[key]));
  assert.ok(range('x')>.02&&range('x')<.05,'weight transfer must be visible but remain over the stance');
  assert.ok(range('hipYaw')>.04&&range('chestYaw')>.04,'the hips and chest should not remain rigidly aligned');
  assert.ok(range('shoulder')>.01,'shoulders should react independently instead of staying level');
  assert.ok(range('y')<.008,'passive weight transfer should not become a vertical bounce');
});

test('cruising reactions preserve planted soles and connected ankles across all riders and both modes',()=>{
  for(const mode of ['skate','snowboard'] as const)for(const {id} of CHARACTERS) {
    const visual=createSkaterVisual(mode,id);
    for(let frame=0;frame<180;frame++) {
      const turn=Math.sin(frame/35)*.65;
      visual.setPose({...pose,speed:25+frame/120*5,carve:turn,lean:turn,surfacePitch:-.2+Math.sin(frame/20)*.1,travelSide:frame<90?1:-1});
      visual.root.updateMatrixWorld(true);
      for(const side of [-1,1]) {
        const foot=visual.root.getObjectByName(`foot-${side}`)!,shin=visual.root.getObjectByName(`shin-${side}`)!;
        const sole=visual.deck.worldToLocal(foot.localToWorld(new THREE.Vector3(0,BOARD.soleBottom,0)));
        assert.ok(Math.abs(sole.y-BOARD.gripY)<1e-6,`${id}: sole lost board contact`);
        assert.ok(shin.localToWorld(new THREE.Vector3(0,.5,0)).distanceTo(foot.localToWorld(new THREE.Vector3(0,.06,0)))<.001,`${id}: ankle detached`);
      }
    }
  }
});
