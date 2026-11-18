import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSkaterVisual} from '../src/player/visuals/skaterVisual.ts';
import {CHARACTERS} from '../src/player/characters/catalog.ts';
import {CHARACTER_MODELS} from '../src/player/characters/registry.ts';
import {applyCharacterSkin} from '../src/player/characters/skin.ts';
import {applyWeaponVisibility} from '../src/player/characters/weapons.ts';

Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})}});

test('riders author only selected models, reuse attachments, and keep visited looks out of the animated scene',()=>{
  const calls=new Map<string,number>(),builders=CHARACTERS.map(({id})=>({id,build:CHARACTER_MODELS[id].buildLook}));
  for(const {id,build} of builders)CHARACTER_MODELS[id].buildLook=context=>{calls.set(id,(calls.get(id)??0)+1);return build(context);};
  try {
    const rider=createSkaterVisual();
    assert.deepEqual([...calls.keys()],['boy']);
    const original=rider.root.getObjectByName('character-head-boy')!;
    let disposed=0;
    original.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.addEventListener('dispose',()=>disposed++);});
    for(let repeat=0;repeat<2;repeat++)for(const {id} of CHARACTERS) {
      rider.setCharacter(id);
      const attached=new Set<string>();let nodes=0;
      rider.root.traverse(object=>{nodes++;if(object.userData.characterSkin)attached.add(object.userData.characterSkin);});
      assert.deepEqual([...attached],[id]);
      assert.ok(nodes<130,`${id}: inactive roster details remain attached (${nodes} objects)`);
    }
    assert.ok([...calls.values()].every(count=>count===1),'each model should be authored once');
    rider.setCharacter('boy');assert.equal(rider.root.getObjectByName(original.name),original);
    const second=createSkaterVisual();
    const firstMesh=original.children.find(object=>object instanceof THREE.Mesh) as THREE.Mesh;
    const secondMesh=second.root.getObjectByName(original.name)!.children.find(object=>object instanceof THREE.Mesh) as THREE.Mesh;
    assert.notEqual(firstMesh,secondMesh);assert.equal(firstMesh.geometry,secondMesh.geometry);assert.equal(firstMesh.material,secondMesh.material);
    assert.equal(calls.get('boy'),1);assert.equal(disposed,0,'cached assets must survive selection changes');
  } finally {for(const {id,build} of builders)CHARACTER_MODELS[id].buildLook=build;}
});

test('newly selected and cloned attachments inherit mode and weapon preferences before their first build',()=>{
  const rider=createSkaterVisual('snowboard','boy');applyWeaponVisibility(rider.root,false);
  for(const id of ['finn','sahur','sasuke','girl','goku'] as const) {
    rider.setCharacter(id);
    rider.root.traverse(object=>{
      if(object.userData.rideSkin)assert.equal(object.visible,object.userData.rideSkin==='snowboard');
      if(object.userData.heldWeapon)assert.equal(object.visible,false);
    });
  }
  const clone=rider.root.clone(true);applyCharacterSkin(clone,'finn');
  const sword=clone.getObjectByName('character-sword-finn')!;assert.equal(sword.visible,false);
  applyWeaponVisibility(clone,true);assert.equal(sword.visible,true);
  applyCharacterSkin(clone,'sahur');assert.equal(clone.getObjectByName('character-sword-finn'),undefined);
  assert.equal(clone.getObjectByName('character-bat-sahur')!.visible,true);
  applyCharacterSkin(clone,'finn');assert.equal(clone.getObjectByName(sword.name),sword);assert.equal(sword.visible,true);
  assert.equal(rider.root.getObjectByName('character-head-goku')!.visible,true,'clone selection must not mutate the live rider');
});
