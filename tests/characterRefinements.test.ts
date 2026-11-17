import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSkaterVisual} from '../src/player/skaterVisual.ts';
import {applyCharacterSkin} from '../src/characters.ts';
import {GRABS} from '../src/player/grabs.ts';

Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})}});
const pose={dt:1/60,speed:25,push:0,verticalSpeed:0,grinding:false,crouch:0,lean:0,airborne:false,bail:false,wheelRoll:0,boardSpin:{x:0,y:0,z:0}};

test('Finn carries Scarlet on the right wrist through grabs, mode switches and captured crash looks',()=>{
  const v=createSkaterVisual('skate','finn'),hand=v.root.getObjectByName('hand-1')!,sword=hand.getObjectByName('character-sword-finn')!;
  assert.ok(sword);assert.equal(v.root.getObjectByName('hand--1')!.getObjectByName('character-sword-finn'),undefined);
  sword.updateMatrix();const local=sword.matrix.clone();
  for(const mode of ['skate','snowboard'] as const) {
    v.setMode(mode);
    for(const grab of [undefined,GRABS.tomahawk,GRABS.pushout]) {
      for(let frame=0;frame<40;frame++)v.setPose({...pose,airborne:!!grab,grab});
      v.root.updateMatrixWorld(true);
      assert.equal(sword.visible,true);
      assert.ok(sword.matrix.equals(local),'the sword must stay rigid in the grip instead of drifting in world space');
      if(!grab) {
        const hilt=sword.localToWorld(new THREE.Vector3(0,.005,0)),tip=sword.localToWorld(new THREE.Vector3(0,.590,0));
        assert.ok(tip.y>hilt.y+.25,'the normal riding grip should hold the blade up instead of inverted toward the ground');
      }
      const part=v.captureRagdoll().parts.find(p=>p.id==='hand1')!;
      assert.ok(part.objects.some(o=>o.getObjectByName('character-sword-finn')===sword));
    }
  }
  v.setCharacter('bart');assert.equal(sword.visible,false);
  const crash=hand.clone(true);applyCharacterSkin(crash,'finn');assert.equal(crash.getObjectByName('character-sword-finn')!.visible,true);
  v.setCharacter('finn');assert.equal(sword.visible,true);
});

test('Bart keeps shortened arm bones in motion and crash captures without changing standard riders',()=>{
  const v=createSkaterVisual('skate','bart');
  for(const grab of [undefined,GRABS.nosegrab,GRABS.tailbone]) {
    for(let i=0;i<60;i++)v.setPose({...pose,airborne:!!grab,grab});
    const rig=v.captureRagdoll();
    for(const side of [-1,1]) {
      const shoulder=rig.joints.find(j=>j.a==='torso'&&j.b===`arm${side}`)!.anchor;
      const elbow=rig.joints.find(j=>j.a===`arm${side}`&&j.b===`fore${side}`)!.anchor;
      const wrist=rig.joints.find(j=>j.a===`fore${side}`&&j.b===`hand${side}`)!.anchor;
      assert.ok(Math.abs(shoulder.distanceTo(elbow)-.25*.9*.82)<1e-6);
      assert.ok(Math.abs(elbow.distanceTo(wrist)-.24*.9*.82)<1e-6);
      const shape=rig.parts.find(p=>p.id===`arm${side}`)!.shape;assert.equal(shape.kind,'capsule');
      if(shape.kind==='capsule')assert.ok(Math.abs(shape.length-shoulder.distanceTo(elbow))<1e-6);
    }
  }
  v.setCharacter('boy');for(let i=0;i<80;i++)v.setPose(pose);
  const rig=v.captureRagdoll();
  assert.equal(rig.parts.find(p=>p.id==='arm1')!.shape.kind,'capsule');
  const arm=rig.parts.find(p=>p.id==='arm1')!.shape;if(arm.kind==='capsule')assert.equal(arm.length,.25);
});
