import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSkaterVisual} from '../src/player/visuals/skaterVisual.ts';
import {CHARACTERS} from '../src/player/characters/catalog.ts';
import {CHARACTER_MODELS} from '../src/player/characters/registry.ts';

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
