import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CHARACTER_MODELS} from '../src/player/characters/registry.ts';
import {createSkaterVisual} from '../src/player/visuals/skaterVisual.ts';

test('registered wrist props participate in selection, mode changes and crash capture without rig special cases',()=>{
  const model=CHARACTER_MODELS.bart,original=model.buildHand,oldDocument=globalThis.document;
  Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})}});
  // Exercise the attachment contract on a character that does not normally carry a prop.
  model.buildHand=(hand,side)=>{
    const prop=new THREE.Group();prop.name=`registered-prop-${side}`;
    prop.userData.characterSkin='bart';hand.add(prop);
  };
  try {
    const visual=createSkaterVisual('skate','bart');
    const pose={dt:1/60,speed:25,push:0,verticalSpeed:0,grinding:false,crouch:0,lean:0,airborne:false,bail:false,wheelRoll:0,boardSpin:{x:0,y:0,z:0}};
    for(const mode of ['skate','snowboard'] as const) {
      visual.setMode(mode);visual.setPose(pose);
      for(const side of [-1,1]) {
        const prop=visual.root.getObjectByName(`registered-prop-${side}`)!;
        assert.equal(prop.parent,visual.root.getObjectByName(`hand-${side}`));
        assert.equal(prop.visible,true);
        const captured=visual.captureRagdoll().parts.find(part=>part.id===`hand${side}`)!;
        assert.ok(captured.objects.some(object=>object.getObjectByName(prop.name)===prop));
      }
      visual.setCharacter('boy');
      for(const side of [-1,1])assert.equal(visual.root.getObjectByName(`registered-prop-${side}`),undefined);
      visual.setCharacter('bart');
    }
  } finally {
    if(original)model.buildHand=original;else delete model.buildHand;
    if(oldDocument)globalThis.document=oldDocument;else delete (globalThis as Record<string,unknown>).document;
  }
});
