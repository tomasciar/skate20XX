import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {createSkaterVisual} from '../src/player/visuals/skaterVisual.ts';
import {applyCharacterSkin} from '../src/characters.ts';
import {applyWeaponVisibility} from '../src/player/characters/weapons.ts';
import {createWeaponControls,loadWeaponVisibility,saveWeaponVisibility,WEAPON_STORAGE_KEY} from '../src/ui/weapons.ts';
import {createRagdoll} from '../src/player/movement/ragdoll.ts';

test('held weapons default to visible and the preference tolerates disabled storage',()=>{
  const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  assert.equal(loadWeaponVisibility(storage),true);saveWeaponVisibility(false,storage);assert.equal(loadWeaponVisibility(storage),false);
  saveWeaponVisibility(true,storage);assert.equal(loadWeaponVisibility(storage),true);
  const blocked={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
  assert.equal(loadWeaponVisibility(blocked),true);assert.doesNotThrow(()=>saveWeaponVisibility(false,blocked));
});

test('weapon toggle restores the saved state, updates accessibility, persists and returns keyboard focus',()=>{
  class Button extends EventTarget {
    attributes=new Map<string,string>();blurs=0;
    setAttribute(name:string,value:string){this.attributes.set(name,value);}
    blur(){this.blurs++;}
  }
  const button=new Button(),values=new Map([[WEAPON_STORAGE_KEY,'off']]),changes:boolean[]=[];
  const oldDocument=globalThis.document,oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.assign(globalThis,{document:{getElementById:()=>button}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)}});
  try {
    const control=createWeaponControls(shown=>changes.push(shown));
    assert.deepEqual(changes,[false]);assert.equal(button.attributes.get('aria-pressed'),'false');
    button.dispatchEvent(new Event('click'));assert.equal(control.shown,true);assert.equal(button.blurs,1);
    assert.equal(values.get(WEAPON_STORAGE_KEY),'on');assert.equal(button.attributes.get('aria-pressed'),'true');
    control.dispose();button.dispatchEvent(new Event('click'));assert.deepEqual(changes,[false,true]);
  } finally {
    if(oldDocument)globalThis.document=oldDocument;else delete (globalThis as Record<string,unknown>).document;
    if(oldStorage)Object.defineProperty(globalThis,'localStorage',oldStorage);else delete (globalThis as Record<string,unknown>).localStorage;
  }
});

test('sword and bat visibility survives rider/mode/crash changes without changing hitboxes or physical resources',async()=>{
  const oldDocument=globalThis.document;
  Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})}});
  await RAPIER.init();const scene=new THREE.Scene(),world=new RAPIER.World({x:0,y:-18,z:0}),ragdoll=createRagdoll(scene,world);
  try {
    const v=createSkaterVisual('skate','finn');scene.add(v.root);
    const sword=v.root.getObjectByName('character-sword-finn')!;
    assert.equal(v.root.getObjectByName('character-bat-sahur'),undefined);
    assert.equal(sword.visible,true);
    applyWeaponVisibility(scene,false);v.setCharacter('sahur');v.setMode('snowboard');
    const bat=v.root.getObjectByName('character-bat-sahur')!;
    assert.equal(sword.visible,false);assert.equal(bat.visible,false);
    const pose={dt:1/60,speed:25,push:0,verticalSpeed:0,grinding:false,crouch:0,lean:0,airborne:false,bail:false,wheelRoll:0,boardSpin:{x:0,y:0,z:0}};
    for(let i=0;i<60;i++)v.setPose(pose);
    const rig=v.captureRagdoll(),shapes=JSON.stringify(rig.parts.map(p=>[p.id,p.mass,p.shape]));
    assert.equal(rig.parts.length,15);assert.ok(!rig.parts.some(p=>/sword|bat/.test(p.id)));
    ragdoll.start(rig,new THREE.Vector3(),new THREE.Vector3());
    assert.equal(ragdoll.root.getObjectByName('character-bat-sahur')!.visible,false);
    const colliders=world.colliders.len(),bodies=world.bodies.len();
    applyWeaponVisibility(scene,true);
    assert.equal(bat.visible,true);assert.equal(sword.visible,false);
    assert.equal(ragdoll.root.getObjectByName('character-bat-sahur')!.visible,true);
    assert.equal(ragdoll.root.getObjectByName('character-sword-finn'),undefined);
    assert.equal(JSON.stringify(v.captureRagdoll().parts.map(p=>[p.id,p.mass,p.shape])),shapes);
    v.setCharacter('finn');applyCharacterSkin(ragdoll.root,'finn');
    assert.equal(sword.visible,true);
    assert.equal(ragdoll.root.getObjectByName('character-sword-finn')!.visible,true);
    applyWeaponVisibility(scene,false);v.setMode('skate');
    assert.equal(sword.visible,false);assert.equal(ragdoll.root.getObjectByName('character-sword-finn')!.visible,false);
    assert.equal(world.colliders.len(),colliders);assert.equal(world.bodies.len(),bodies);
  } finally {
    ragdoll.clear();world.free();
    if(oldDocument)globalThis.document=oldDocument;else delete (globalThis as Record<string,unknown>).document;
  }
});
