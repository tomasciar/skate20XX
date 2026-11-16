import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {CHARACTERS,CHARACTER_STORAGE_KEY,loadCharacter,saveCharacter,characterPalette,applyCharacterSkin} from '../src/characters.ts';
import {createCharacterControls} from '../src/ui/characters.ts';
import {createSkaterVisual} from '../src/player/skaterVisual.ts';
import {createBoardPlayer} from '../src/player/board.ts';
import {createRamp} from '../src/world/ramp.ts';
import {createTrickSystem} from '../src/player/tricks.ts';
import {GRABS} from '../src/player/grabs.ts';
import {BOARD} from '../src/player/dimensions.ts';
import {createInput} from '../src/input.ts';
import type {PlayerIntent} from '../src/player/controller.ts';

const context=new Proxy({},{get:()=>()=>{}});
Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>context})}});
const dt=1/120;
const pose={dt:1/60,speed:25,push:0,verticalSpeed:0,grinding:false,crouch:0,lean:0,airborne:false,bail:false,
  wheelRoll:0,boardSpin:{x:0,y:0,z:0}};
const idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
  wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};

test('character choices persist independently of riding mode and tolerate unavailable or invalid storage',()=>{
  const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  assert.equal(loadCharacter(storage),'boy');
  for(const {id} of CHARACTERS){saveCharacter(id,storage);assert.equal(loadCharacter(storage),id);}
  values.set(CHARACTER_STORAGE_KEY,'unknown');assert.equal(loadCharacter(storage),'boy');
  const blocked={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
  assert.equal(loadCharacter(blocked),'boy');assert.doesNotThrow(()=>saveCharacter('girl',blocked));
});

test('the rider selector exposes the roster, saves changes once, and returns keyboard focus to the game',()=>{
  class Select extends EventTarget {
    value='';options:{value:string;textContent:string}[]=[];blurs=0;
    replaceChildren(...options:{value:string;textContent:string}[]){this.options=options;}
    blur(){this.blurs++;}
  }
  const select=new Select(),changes:string[]=[],values=new Map<string,string>();
  const oldDocument=globalThis.document,oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.assign(globalThis,{document:{getElementById:()=>select,createElement:()=>({value:'',textContent:''})}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)}});
  try {
    const controls=createCharacterControls('girl',character=>changes.push(character));
    assert.equal(select.value,'girl');assert.deepEqual(select.options,CHARACTERS.map(({id,name})=>({value:id,textContent:name})));
    select.value='goku';select.dispatchEvent(new Event('change'));assert.deepEqual(changes,['goku']);assert.equal(loadCharacter(),'goku');
    select.dispatchEvent(new Event('change'));assert.equal(changes.length,1);
    select.value='invalid';select.dispatchEvent(new Event('change'));assert.equal(select.value,'goku');assert.equal(changes.length,1);
    assert.equal(select.blurs,3);controls.dispose();select.value='naruto';select.dispatchEvent(new Event('change'));assert.equal(changes.length,1);
  } finally {
    globalThis.document=oldDocument;
    if(oldStorage)Object.defineProperty(globalThis,'localStorage',oldStorage);else delete (globalThis as Record<string,unknown>).localStorage;
  }
});

test('each character has a distinct active look in both modes with the same skeleton and planted feet',()=>{
  const headShapes=new Set<string>();let reference:string|undefined;
  for(const mode of ['skate','snowboard'] as const)for(const {id} of CHARACTERS) {
    const visual=createSkaterVisual(mode,id),palette=characterPalette(id,mode);
    for(let frame=0;frame<80;frame++)visual.setPose(pose);
    visual.root.updateMatrixWorld(true);
    assert.equal(visual.character,id);
    const head=visual.root.getObjectByName('head')!,looks=head.children.filter(object=>object.userData.characterSkin && object.visible);
    assert.equal(looks.length,1);assert.equal(looks[0]!.userData.characterSkin,id);
    const headColors=new Set<number>();looks[0]!.traverse(object=>{if(object instanceof THREE.Mesh)headColors.add(object.material.color.getHex());});
    if(id==='goku' || id==='naruto' || id==='girl')assert.ok(headColors.has(palette.hair));
    if(id==='kick')assert.ok(headColors.has(palette.helmet) && headColors.has(palette.accent));
    assert.equal((visual.root.getObjectByName('chest') as THREE.Mesh).material.color.getHex(),palette.shirt);
    const bounds=new THREE.Box3().setFromObject(looks[0]!);headShapes.add(JSON.stringify([Array.from(headColors).sort(),bounds.getSize(new THREE.Vector3()).toArray()]));
    for(const side of [-1,1]) {
      const foot=visual.root.getObjectByName(`foot-${side}`)!;
      const sole=visual.board.worldToLocal(foot.localToWorld(new THREE.Vector3(0,BOARD.soleBottom,0)));
      assert.ok(Math.abs(sole.y-BOARD.gripY)<1e-6);
    }
    const rig=visual.captureRagdoll(),signature=JSON.stringify({parts:rig.parts.map(part=>[part.id,part.mass,part.shape,part.center.toArray()]),joints:rig.joints.map(joint=>[joint.a,joint.b,joint.kind,joint.anchor.toArray()])});
    reference ??=signature;assert.equal(signature,reference,'avatar selection must not alter physical proportions or joint targets');
    let meshes=0;visual.root.traverseVisible(object=>{if(object instanceof THREE.Mesh)meshes++;});
    assert.ok(meshes<=60,`${id} ${mode} has too many visible meshes: ${meshes}`);
  }
  assert.ok(headShapes.size>=5);
});

test('all characters retain board contact through held grabs and preserve the selected look when switching modes',()=>{
  for(const {id} of CHARACTERS) {
    const visual=createSkaterVisual('skate',id);
    for(const mode of ['skate','snowboard'] as const) {
      visual.setMode(mode);assert.equal(visual.character,id);
      for(const grab of [GRABS.tomahawk,GRABS.pushout,GRABS.nosebone,GRABS.tailbone]) {
        for(let frame=0;frame<80;frame++)visual.setPose({...pose,airborne:true,grab});
        visual.root.updateMatrixWorld(true);
        for(const side of [-1,1]) {
          const foot=visual.root.getObjectByName(`foot-${side}`)!;
          const sole=visual.board.worldToLocal(foot.localToWorld(new THREE.Vector3(0,BOARD.soleBottom,0)));
          assert.ok(Math.abs(sole.y-BOARD.gripY)<1e-6,`${id}: foot lost contact during ${grab.name}`);
        }
      }
    }
  }
});

async function fixture() {
  await RAPIER.init();
  const scene=new THREE.Scene(),world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  const ramp=createRamp(scene,world,{startPlatform:false}),player=createBoardPlayer(scene,world,ramp),tricks=createTrickSystem();
  const tick=(intent:PlayerIntent=idle)=>{player.update(dt,intent,tricks.state);world.step();player.sync(false);};
  for(let frame=0;frame<90;frame++)tick();
  return {scene,world,ramp,player,tricks,tick};
}

test('switching riders and board modes preserves actual momentum, collision counts, and trajectory',async()=>{
  const reference=await fixture(),subject=await fixture();
  try {
    const bodies=subject.world.bodies.len(),colliders=subject.world.colliders.len(),resets=subject.player.resetCount;
    for(const f of [reference,subject])f.player.body.setLinvel(f.ramp.forward.clone().multiplyScalar(30),true);
    for(let frame=0;frame<180;frame++) {
      if(frame%30===0)subject.player.setCharacter(CHARACTERS[Math.floor(frame/30)%CHARACTERS.length]!.id);
      if(frame===90)for(const f of [reference,subject]){f.player.setMode('snowboard');f.ramp.setMode!('snowboard');}
      reference.tick();subject.tick();
      assert.ok(reference.player.position.distanceTo(subject.player.position)<1e-6);
      assert.ok(reference.player.velocity.distanceTo(subject.player.velocity)<1e-6);
      assert.equal(subject.world.bodies.len(),bodies);assert.equal(subject.world.colliders.len(),colliders);
      assert.equal(subject.player.crashed,false);assert.equal(subject.player.resetCount,resets);
    }
    subject.player.setCharacter('girl');subject.player.reset(subject.ramp.spawn);assert.equal(subject.player.character,'girl');
  } finally {reference.world.free();subject.world.free();}
});

test('costumes and head details survive crashes and can be switched on the active ragdoll',async()=>{
  const f=await fixture();
  try {
    f.player.setCharacter('naruto');f.tricks.state.bail=true;f.tick();assert.equal(f.player.crashed,true);
    const crash=f.scene.getObjectByName('crash-ragdoll')!;assert.ok(crash);
    const torso=crash.getObjectByName('character-outfit-naruto');assert.ok(torso && torso.visible);
    f.player.setCharacter('kick');
    assert.equal(crash.getObjectByName('character-head-naruto')!.visible,false);
    assert.equal(crash.getObjectByName('character-head-kick')!.visible,true);
    assert.equal(crash.getObjectByName('character-outfit-kick')!.visible,true);
    assert.equal((crash.getObjectByName('chest') as THREE.Mesh).material.color.getHex(),characterPalette('kick','skate').shirt);
    const clone=crash.clone(true);applyCharacterSkin(clone,'girl');assert.equal(clone.getObjectByName('character-head-girl')!.visible,true);
    f.tick({...idle,reset:true});assert.equal(f.player.crashed,false);assert.equal(f.player.character,'kick');
  } finally {f.world.free();}
});

test('using Space in a character selector does not queue an ollie, while real crouch releases still work',()=>{
  class Element extends EventTarget {closest(){return this;}}
  const previousWindow=globalThis.window,previousElement=globalThis.HTMLElement;
  Object.assign(globalThis,{window:new EventTarget(),HTMLElement:Element});
  const input=createInput(),select=new Element();
  function key(type:string,target?:EventTarget) {
    const event=new Event(type,{cancelable:true});Object.assign(event,{code:'Space',repeat:false});
    if(target)Object.defineProperty(event,'target',{value:target});window.dispatchEvent(event);return event;
  }
  try {
    assert.equal(key('keydown',select).defaultPrevented,false);key('keyup',select);input.beginFrame();
    assert.equal(input.state.crouch,false);assert.equal(input.state.crouchReleased,false);
    key('keydown');assert.equal(input.state.crouch,true);key('keyup',select);assert.equal(input.state.crouchReleased,true);
  } finally {
    input.dispose();
    if(previousWindow)globalThis.window=previousWindow;else delete (globalThis as Record<string,unknown>).window;
    if(previousElement)globalThis.HTMLElement=previousElement;else delete (globalThis as Record<string,unknown>).HTMLElement;
  }
});
