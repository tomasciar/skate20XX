import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {SENSITIVITY_CONTROLS,clampSensitivity,type SensitivitySettings} from '../src/player/movement/sensitivity.ts';
import {createSensitivityControls,loadSensitivitySettings,saveSensitivity,LEGACY_SENSITIVITY_STORAGE_KEY} from '../src/ui/sensitivity.ts';
import {createController,type PlayerIntent} from '../src/player/controller.ts';
import {createAirRotation} from '../src/player/movement/airRotation.ts';
import {createSlide} from '../src/player/movement/slide.ts';
import {createBoardPlayer} from '../src/player/board.ts';
import {createTrickSystem} from '../src/player/tricks/tricks.ts';
import type {RampWorld} from '../src/world/ramp.ts';
import type {InputState} from '../src/input.ts';

const dt=1/120,defaults:SensitivitySettings={carve:1,flip:1,turn:1};
const idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};
const memory=()=>{
  const values=new Map<string,string>();
  return {values,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
};

test('the three sensitivity preferences default to current handling, persist independently and remain bounded',()=>{
  const storage=memory();assert.deepEqual(loadSensitivitySettings(storage),defaults);
  saveSensitivity('carve',.5,storage);saveSensitivity('flip',2,storage);saveSensitivity('turn',1.5,storage);
  assert.deepEqual(loadSensitivitySettings(storage),{carve:.5,flip:2,turn:1.5});
  for(const [stored,expected] of [['0',.5],['10',2],['bad',1],['',1],['Infinity',1]] as const) {
    storage.values.set('skate20XX.sensitivity.flip',stored);assert.equal(loadSensitivitySettings(storage).flip,expected);
    assert.equal(loadSensitivitySettings(storage).carve,.5);assert.equal(loadSensitivitySettings(storage).turn,1.5);
  }
  const blocked={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
  assert.deepEqual(loadSensitivitySettings(blocked),defaults);assert.doesNotThrow(()=>saveSensitivity('flip',2,blocked));
  assert.equal(clampSensitivity(NaN),1);
});

test('the previous shared preference carries into all three sliders until they are adjusted independently',()=>{
  const storage=memory();storage.values.set(LEGACY_SENSITIVITY_STORAGE_KEY,'1.4');
  assert.deepEqual(loadSensitivitySettings(storage),{carve:1.4,flip:1.4,turn:1.4});
  saveSensitivity('carve',2,storage);saveSensitivity('flip',.5,storage);
  assert.deepEqual(loadSensitivitySettings(storage),{carve:2,flip:.5,turn:1.4});
  assert.equal(storage.values.get(LEGACY_SENSITIVITY_STORAGE_KEY),'1.4');
});

test('grouped sliders restore saved values, update independently, announce their values, and release pointer focus',()=>{
  class Slider extends EventTarget {
    value='';min='';max='';step='';blurs=0;attributes=new Map<string,string>();
    setAttribute(name:string,value:string){this.attributes.set(name,value);}
    blur(){this.blurs++;}
  }
  const sliders={carve:new Slider(),flip:new Slider(),turn:new Slider()};
  const outputs={carve:{textContent:''},flip:{textContent:''},turn:{textContent:''}};
  const storage=memory(),changes:SensitivitySettings[]=[];storage.values.set(LEGACY_SENSITIVITY_STORAGE_KEY,'1.5');
  const oldDocument=globalThis.document,oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.assign(globalThis,{document:{getElementById:(id:string)=>{
    const control=id.split('-')[0] as keyof typeof sliders;return id.endsWith('-value')?outputs[control]:sliders[control];
  }}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
  try {
    const control=createSensitivityControls(values=>changes.push(values));
    assert.deepEqual(changes,[{carve:1.5,flip:1.5,turn:1.5}]);
    for(const key of SENSITIVITY_CONTROLS) {
      assert.equal(sliders[key].min,'0.5');assert.equal(sliders[key].max,'2');assert.equal(sliders[key].step,'0.05');
      assert.equal(outputs[key].textContent,'1.50×');
    }
    sliders.carve.value='2';sliders.carve.dispatchEvent(new Event('input'));
    sliders.flip.value='.5';sliders.flip.dispatchEvent(new Event('input'));
    sliders.turn.value='1.25';sliders.turn.dispatchEvent(new Event('input'));
    assert.deepEqual(control.values,{carve:2,flip:.5,turn:1.25});
    assert.deepEqual(loadSensitivitySettings(storage),control.values);
    assert.equal(outputs.carve.textContent,'2.00×');assert.equal(outputs.flip.textContent,'0.50×');assert.equal(outputs.turn.textContent,'1.25×');
    assert.equal(sliders.flip.attributes.get('aria-valuetext'),'0.50 times');
    assert.equal(sliders.flip.blurs,0,'keyboard users must be able to adjust repeatedly');
    sliders.flip.dispatchEvent(new Event('pointerup'));assert.equal(sliders.flip.blurs,1);
    changes[0].carve=99;assert.equal(control.values.carve,2,'callback snapshots must not mutate the controls');
    control.dispose();sliders.carve.value='.5';sliders.carve.dispatchEvent(new Event('input'));assert.equal(changes.length,4);
  } finally {
    if(oldDocument)globalThis.document=oldDocument;else delete (globalThis as Record<string,unknown>).document;
    if(oldStorage)Object.defineProperty(globalThis,'localStorage',oldStorage);else delete (globalThis as Record<string,unknown>).localStorage;
  }
});

test('independent controller sensitivities survive resets without scaling pushes, trick directions or balance input',()=>{
  const controller=createController();controller.setSensitivities({carve:.5,flip:2,turn:1.25});controller.reset();
  const input:InputState={trickModifier:false,grabDX:1,grabDY:0,grabPress:0,arrowDX:1,arrowDY:0,push:true,brake:false,
    left:false,right:true,crouch:false,crouchPressed:false,crouchReleased:false,reset:false,flickDX:0,flickDY:0,flickReady:false};
  const intent=controller.update(input,dt);
  assert.equal(intent.carveSensitivity,.5);assert.equal(intent.flipSensitivity,2);assert.equal(intent.turnSensitivity,1.25);
  assert.equal(intent.push,1);assert.equal(intent.steer,1);assert.equal(intent.grabDX,1);assert.equal(intent.groundDX,1);
  controller.setSensitivities({carve:99,flip:-1,turn:NaN});
  const clamped=controller.update(input,dt);
  assert.equal(clamped.carveSensitivity,2);assert.equal(clamped.flipSensitivity,.5);assert.equal(clamped.turnSensitivity,1);
});

test('single-axis and diagonal flip-mode rotations scale from half to double after normalization',()=>{
  for(const [pitch,roll] of [[1,0],[0,1],[1,1]])for(const heading of [0,Math.PI]) {
    const angle=(sensitivity:number)=>{
      const flip=createAirRotation();for(let i=0;i<60;i++)flip.update(dt,i===0,pitch,roll,true,heading,sensitivity);
      return Math.hypot(flip.state.pitch,flip.state.roll);
    };
    const baseline=angle(1);assert.ok(Math.abs(angle(.5)/baseline-.5)<1e-8);assert.ok(Math.abs(angle(2)/baseline-2)<1e-8);
  }
});

async function measure(values:SensitivitySettings) {
  await RAPIER.init();const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  const floor=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-.1,0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(50,.1,500),floor);
  const anchor=new THREE.Vector3(),ramp:RampWorld={mesh:new THREE.Group(),spawn:new THREE.Vector3(0,.02,0),anchor,surfaceOrigin:anchor,endZ:-99999,
    surfaceNormal:new THREE.Vector3(0,1,0),forward:new THREE.Vector3(0,0,-1),distance:0,grindRails:[],scroll:()=>new THREE.Vector3(),reset:()=>{},prepareNextChunk:()=>true,flushDeferredDestroy:()=>{}};
  const player=createBoardPlayer(new THREE.Scene(),world,ramp),tricks=createTrickSystem();
  const intent={...idle,carveSensitivity:values.carve,flipSensitivity:values.flip,turnSensitivity:values.turn};
  const tick=(command:PlayerIntent=idle)=>{player.update(dt,command,tricks.state);world.step();player.sync(false);};
  try {
    for(let i=0;i<90;i++)tick();
    for(let i=0;i<30;i++) {
      player.body.setLinvel(player.forward.clone().multiplyScalar(20),true);tick({...intent,steer:1});assert.equal(player.airborne,false);
    }
    const carve=Math.abs(Math.atan2(player.forward.x,-player.forward.z));
    player.reset(new THREE.Vector3(0,10,0));tick();assert.equal(player.airborne,true);
    for(let i=0;i<18;i++)tick({...intent,steer:1});
    const turn=Math.abs(Math.atan2(player.forward.x,-player.forward.z));
    player.reset(new THREE.Vector3(0,10,0));tick();
    for(let i=0;i<30;i++)tick({...intent,push:1,steer:1,toggleAirFlip:i===0});
    assert.equal(player.aerial.active,true);
    return {carve,turn,flip:Math.hypot(player.aerial.pitch,player.aerial.roll)};
  } finally {world.free();}
}

test('each slider independently scales only its actual ground, air-steering or flip-mode rotation',async()=>{
  const baseline=await measure(defaults);
  for(const control of SENSITIVITY_CONTROLS)for(const value of [.5,2]) {
    const result=await measure({...defaults,[control]:value});
    for(const metric of SENSITIVITY_CONTROLS) {
      const expected=metric===control?value:1;
      assert.ok(Math.abs(result[metric]/baseline[metric]-expected)<.002,`${control}=${value} should give ${metric}=${expected}×, got ${result[metric]/baseline[metric]}`);
    }
  }
});

test('boardslide turns respond to turn speed without changing their target angle',()=>{
  const turns=[.5,1,2].map(sensitivity=>createSlide().update(.02,true,0,0,0,20,true,sensitivity));
  assert.ok(turns[0]<turns[1] && turns[1]<turns[2]);for(const turn of turns)assert.ok(turn>0 && turn<Math.PI/2);
});
