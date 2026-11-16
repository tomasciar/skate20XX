import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {CHARACTERS,CHARACTER_STORAGE_KEY,loadCharacter,saveCharacter,characterPalette,applyCharacterSkin} from '../src/characters.ts';
import {createCharacterControls} from '../src/ui/characters.ts';
import {createSkaterVisual} from '../src/player/skaterVisual.ts';
import {hasFaceArtwork} from '../src/player/faceArtwork.ts';
import {createBoardPlayer} from '../src/player/board.ts';
import {createRamp} from '../src/world/ramp.ts';
import {createTrickSystem} from '../src/player/tricks.ts';
import {GRABS} from '../src/player/grabs.ts';
import {BOARD,RIDER} from '../src/player/dimensions.ts';
import {stuntHelmetGeometry} from '../src/player/modelGeometry.ts';
import {createRagdoll} from '../src/player/ragdoll.ts';
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

test('each character has a distinct active look in both modes with planted feet and a consistent rig topology',()=>{
  const headShapes=new Set<string>();let reference:string|undefined;
  for(const mode of ['skate','snowboard'] as const)for(const {id} of CHARACTERS) {
    const visual=createSkaterVisual(mode,id),palette=characterPalette(id,mode);
    for(let frame=0;frame<80;frame++)visual.setPose(pose);
    visual.root.updateMatrixWorld(true);
    assert.equal(visual.character,id);
    const head=visual.root.getObjectByName('head')!,looks=head.children.filter(object=>object.userData.characterSkin && object.visible);
    assert.equal(looks.length,1);assert.equal(looks[0]!.userData.characterSkin,id);
    const headColors=new Set<number>();looks[0]!.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      const colors=object.geometry.getAttribute('color');
      if(colors)for(let i=0;i<colors.count;i++)headColors.add(new THREE.Color().fromBufferAttribute(colors,i).getHex());
      else headColors.add(object.material.color.getHex());
    });
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
    if(id!=='kick'){reference ??=signature;assert.equal(signature,reference,'full-height riders retain their shared joint targets');}
    else {
      assert.equal(rig.parts.length,15);assert.equal(rig.joints.length,14);
      assert.equal(rig.parts.find(part=>part.id==='head')!.shape.radius,.115*.76);
    }
    let meshes=0,triangles=0;
    visual.root.traverseVisible(object=>{
      if(!(object instanceof THREE.Mesh))return;meshes++;
      triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3;
      for(const attribute of ['position','normal']) {
        const values=object.geometry.getAttribute(attribute).array;
        for(const value of values)assert.ok(Number.isFinite(value),`${id}: non-finite ${attribute} in the visible model`);
      }
    });
    assert.ok(meshes<=60,`${id} ${mode} has too many visible meshes: ${meshes}`);
    assert.ok(triangles<=20000,`${id} ${mode} exceeds the rider geometry budget: ${triangles}`);
  }
  assert.ok(headShapes.size>=5);
});

test('Goku keeps a broad asymmetric fan and Naruto a shorter compact hair silhouette',()=>{
  for(const id of ['goku','naruto'] as const) {
    const visual=createSkaterVisual('skate',id),bounds=new THREE.Box3(),palette=characterPalette(id,'skate');
    const look=visual.root.getObjectByName(`character-head-${id}`)!;
    look.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      const positions=object.geometry.getAttribute('position'),colors=object.geometry.getAttribute('color');
      if(!colors)return;
      for(let i=0;i<positions.count;i++)if(new THREE.Color().fromBufferAttribute(colors,i).getHex()===palette.hair)
        bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(positions,i));
    });
    const size=bounds.getSize(new THREE.Vector3());
    if(id==='goku') {
      assert.ok(size.x>0.3 && bounds.max.y<0.25,'Goku should spread sideways rather than form a tall crown');
      assert.ok(Math.abs(bounds.min.x)>bounds.max.x,'the fan should retain its asymmetric sweep');
    } else assert.ok(bounds.max.y<0.18 && bounds.max.y>0.12,'Naruto should have short layered spikes');
  }
});

test('Goku and Naruto have visible hair coverage on both lower sides and across the nape',()=>{
  for(const id of ['goku','naruto'] as const) {
    const visual=createSkaterVisual('skate',id),hair=characterPalette(id,'skate').hair;
    const head=visual.root.getObjectByName(`character-head-${id}`)!.clone();head.updateMatrixWorld(true);
    const opaque:THREE.Object3D[]=[];
    // Raycaster cannot sample alpha: the transparent edges of facial decals aren't scalp occluders.
    head.traverseVisible(object=>{if(object instanceof THREE.Mesh&&!object.userData.faceArtwork)opaque.push(object);});
    for(const angle of [-2.2,-1.9,-1.12,1.12,1.9,2.2,Math.PI]) {
      const outward=new THREE.Vector3(Math.sin(angle),0,-Math.cos(angle));
      const origin=outward.clone().multiplyScalar(.35);origin.y=Math.abs(angle)<1.3?(id==='goku'?-.008:-.024):angle===Math.PI?-.05:-.038;
      const hit=new THREE.Raycaster(origin,outward.negate(),0,1).intersectObjects(opaque,false)[0];
      assert.ok(hit?.face,`${id}: a lower scalp ray missed the head`);
      const colors=(hit.object as THREE.Mesh).geometry.getAttribute('color');
      assert.ok(colors,`${id}: scalp should be part of the opaque hair mesh`);
      assert.equal(new THREE.Color().fromBufferAttribute(colors,hit.face.a).getHex(),hair,`${id}: exposed skin at scalp angle ${angle}`);
    }
  }
});

test('rounded shoulders follow every arm root and remain attached to the arm in crash models',()=>{
  for(const mode of ['skate','snowboard'] as const)for(const {id} of CHARACTERS) {
    const visual=createSkaterVisual(mode,id);
    for(const grab of [undefined,GRABS.tomahawk,GRABS.tailbone]) {
      for(let frame=0;frame<30;frame++)visual.setPose({...pose,airborne:!!grab,grab});
      const rig=visual.captureRagdoll();
      for(const side of [-1,1]) {
        const shoulder=visual.root.getObjectByName(`shoulder-${side}`)!;
        const joint=rig.joints.find(joint=>joint.a==='torso'&&joint.b===`arm${side}`)!;
        assert.ok(shoulder.visible);assert.ok(shoulder.getWorldPosition(new THREE.Vector3()).distanceTo(joint.anchor)<1e-6);
        assert.ok(rig.parts.find(part=>part.id===`arm${side}`)!.objects.includes(shoulder));
        assert.ok(!rig.parts.find(part=>part.id==='torso')!.objects.includes(shoulder));
      }
    }
    const crash=visual.root.clone(true);applyCharacterSkin(crash,'goku');
    assert.equal(crash.getObjectByName('shoulder-1')!.scale.x,1.24);
    applyCharacterSkin(crash,'naruto');assert.equal(crash.getObjectByName('shoulder-1')!.scale.x,1);
  }
});

test('Kick has an open chin, a low helmet brow, and no nose drawn over the skin',()=>{
  const helmet=new THREE.Mesh(stuntHelmetGeometry(),new THREE.MeshBasicMaterial());
  const ray=(y:number)=>new THREE.Raycaster(new THREE.Vector3(0,y,-.4),new THREE.Vector3(0,0,1));
  for(const y of [-.09,-.05,-.002])assert.equal(ray(y).intersectObject(helmet).length,0,'helmet must not form a chin bar or cover the eyes');
  assert.ok(ray(.026).intersectObject(helmet).length>0,'brow should sit just above the eyes');
  const visual=createSkaterVisual('skate','kick'),head=visual.root.getObjectByName('character-head-kick')!.clone();head.updateMatrixWorld(true);
  const origin=head.localToWorld(new THREE.Vector3(0,-.04,-.4)),direction=new THREE.Vector3(0,0,1).transformDirection(head.matrixWorld);
  const hit=new THREE.Raycaster(origin,direction).intersectObject(head,true)[0]!;
  assert.ok(hit.face);assert.ok(!hit.object.userData.faceArtwork,'the illustration must leave the nose region unpainted');
  assert.equal(new THREE.Color().fromBufferAttribute((hit.object as THREE.Mesh).geometry.getAttribute('color'),hit.face.a).getHex(),characterPalette('kick','skate').skin);
});

test('shorter Kick keeps full-size shoes planted and every ankle/held grab connected in both modes',()=>{
  for(const mode of ['skate','snowboard'] as const) {
    const visual=createSkaterVisual(mode,'kick'),reference=createSkaterVisual(mode,'boy');
    for(let frame=0;frame<90;frame++){visual.setPose(pose);reference.setPose(pose);}
    const height=(root:THREE.Object3D)=>{
      const bounds=new THREE.Box3();root.updateMatrixWorld(true);
      root.traverseVisible(object=>{if(object instanceof THREE.Mesh){object.geometry.computeBoundingBox();bounds.union(object.geometry.boundingBox!.clone().applyMatrix4(object.matrixWorld));}});
      return bounds.max.y;
    };
    assert.ok(height(visual.root)<height(reference.root)*.90,'Kick should be visibly shorter');
    const connected=()=>{
      visual.root.updateMatrixWorld(true);
      for(const side of [-1,1]) {
        const foot=visual.root.getObjectByName(`foot-${side}`)!,shin=visual.root.getObjectByName(`shin-${side}`)!;
        assert.ok(shin.localToWorld(new THREE.Vector3(0,.5,0)).distanceTo(foot.localToWorld(new THREE.Vector3(0,.06,0)))<.001,'short legs must reach the ankles');
        assert.ok(foot.getWorldScale(new THREE.Vector3()).distanceTo(new THREE.Vector3(1,1,1))<1e-6,'boots must retain their full size');
      }
    };
    for(const grab of Object.values(GRABS)) {
      for(let frame=0;frame<120;frame++){visual.setPose({...pose,airborne:true,grab});connected();}
      const hand=visual.root.getObjectByName(`hand-${grab.hand}`)!.getWorldPosition(new THREE.Vector3());
      const grip=visual.board.localToWorld(new THREE.Vector3(grab.grip.x,grab.grip.y,grab.grip.z).applyAxisAngle(new THREE.Vector3(0,1,0),RIDER.stanceY));
      assert.ok(hand.distanceTo(grip)<.025,`${grab.id}: shorter arms must reach the grip`);
      for(const side of [-1,1])assert.ok(Math.abs(visual.board.worldToLocal(visual.root.getObjectByName(`foot-${side}`)!.localToWorld(new THREE.Vector3(0,BOARD.soleBottom,0))).y-BOARD.gripY)<1e-6);
    }
    for(let frame=0;frame<240;frame++){visual.setPose({...pose,speed:4,push:1});connected();}
  }
});

test('Kick crash clones keep their captured small anatomy and full-size boots when the look is reapplied',async()=>{
  await RAPIER.init();const world=new RAPIER.World({x:0,y:-18,z:0}),scene=new THREE.Scene(),ragdoll=createRagdoll(scene,world);
  try {
    const visual=createSkaterVisual('skate','kick');for(let frame=0;frame<90;frame++)visual.setPose(pose);
    ragdoll.start(visual.captureRagdoll(),new THREE.Vector3(),new THREE.Vector3(0,1,0));
    const chest=ragdoll.root.getObjectByName('chest')!,before=chest.scale.clone();
    applyCharacterSkin(ragdoll.root,'kick');assert.ok(chest.scale.distanceTo(before)<1e-6);
    for(const side of [-1,1])assert.ok(ragdoll.root.getObjectByName(`foot-${side}`)!.scale.distanceTo(new THREE.Vector3(1,1,1))<1e-6);
    for(let frame=0;frame<20;frame++){world.step();ragdoll.sync();}ragdoll.render(1);
    assert.ok(Number.isFinite(ragdoll.focus.x)&&Number.isFinite(ragdoll.focus.y)&&Number.isFinite(ragdoll.focus.z));
  } finally {ragdoll.clear();world.free();}
});

test('eyes and mouths are visible from the front instead of being buried in the head or headgear',()=>{
  for(const {id} of CHARACTERS) {
    const visual=createSkaterVisual('skate',id);visual.setPose({...pose,airborne:true});visual.root.updateMatrixWorld(true);
    const face=visual.root.getObjectByName(`character-head-${id}`)!,meshes:THREE.Object3D[]=[];
    face.traverseVisible(object=>{if(object instanceof THREE.Mesh)meshes.push(object);});
    const visibleColor=(x:number,y:number)=>{
      const origin=face.localToWorld(new THREE.Vector3(x,y,-0.4)),direction=new THREE.Vector3(0,0,1).transformDirection(face.matrixWorld);
      const hit=new THREE.Raycaster(origin,direction,0,1).intersectObjects(meshes,false)[0];
      assert.ok(hit?.face,`${id}: missing face surface`);
      const colors=(hit.object as THREE.Mesh).geometry.getAttribute('color');
      return new THREE.Color().fromBufferAttribute(colors,hit.face.a).getHex();
    };
    if(hasFaceArtwork(id)) {
      const art=face.getObjectByName(`face-artwork-${id}`) as THREE.Mesh;
      assert.ok(art && art.visible);assert.equal((art.material as THREE.Material).userData.faceArtwork,id);
      const origin=face.localToWorld(new THREE.Vector3(0.035,-0.002,-0.4)),direction=new THREE.Vector3(0,0,1).transformDirection(face.matrixWorld);
      assert.equal(new THREE.Raycaster(origin,direction,0,1).intersectObjects(meshes,false)[0]?.object,art,`${id}: facial artwork buried behind the skin`);
      continue;
    }
    const eyeY=-0.002;
    for(const side of [-1,1]) {
      assert.equal(visibleColor(side*0.033,eyeY),0x18202c,`${id}: pupil hidden by the face or hair`);
      assert.equal(visibleColor(side*0.046,eyeY),0xf7f3df,`${id}: eye whites hidden by headgear`);
    }
    assert.equal(visibleColor(0.012,-0.063),0x713d35,`${id}: mouth hidden beneath the skin`);
  }
});

test('Goku has bare arms and short gi caps in both modes, including character changes during a crash',()=>{
  const visual=createSkaterVisual('skate','goku');
  for(const mode of ['skate','snowboard'] as const) {
    visual.setMode(mode);visual.setPose(pose);
    for(const side of [-1,1]) {
      assert.equal((visual.root.getObjectByName(`upper-arm-${side}`) as THREE.Mesh).material.color.getHex(),characterPalette('goku',mode).skin);
      assert.equal((visual.root.getObjectByName(`forearm-${side}`) as THREE.Mesh).material.color.getHex(),characterPalette('goku',mode).skin);
      assert.equal(visual.root.getObjectByName(`sleeve-${side}`)!.visible,false);
    }
  }
  const crash=visual.root.clone(true);applyCharacterSkin(crash,'naruto');
  assert.equal(crash.getObjectByName('sleeve-1')!.visible,true);
  applyCharacterSkin(crash,'goku');assert.equal(crash.getObjectByName('sleeve-1')!.visible,false);
  visual.setCharacter('boy');assert.equal(visual.root.getObjectByName('sleeve-1')!.visible,true);
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
    assert.equal(crash.getObjectByName('chest')!.scale.x,1.18,'the crash model must also adopt the selected character build');
    f.player.setCharacter('goku');assert.equal(crash.getObjectByName('chest')!.scale.x,1.22);
    f.player.setCharacter('kick');
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
