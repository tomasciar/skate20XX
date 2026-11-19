import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createAirRotation } from '../src/player/movement/airRotation.ts';
import { createBoardPlayer } from '../src/player/board.ts';
import { createSkaterVisual, FLIP_LEAN } from '../src/player/visuals/skaterVisual.ts';
import { createTrickSystem } from '../src/player/tricks/tricks.ts';
import { GRABS } from '../src/player/tricks/grabs.ts';
import { BOARD, RIDER } from '../src/player/dimensions.ts';
import type { RampWorld } from '../src/world/ramp.ts';
import type { PlayerIntent } from '../src/player/controller.ts';

const dt=1/120, up=new THREE.Vector3(0,1,0);
const air={dt,speed:25,push:0,verticalSpeed:0,grinding:false,crouch:0,lean:0,airborne:true,bail:false,
  wheelRoll:0,boardSpin:{x:0,y:0,z:0}};
const LEANS=[[1,0],[-1,0],[0,1],[0,-1],[0.7,0.7],[-0.7,0.7],[0.7,-0.7],[-0.7,-0.7]].map(([pitch,roll])=>({pitch:pitch!,roll:roll!}));
type Visual=ReturnType<typeof createSkaterVisual>;
const world=(visual:Visual,name:string)=>{
  visual.root.updateMatrixWorld(true);
  return visual.root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
};
const torsoOf=(visual:Visual)=>visual.root.getObjectByName('chest')!.parent!;

/** Bones keep their length, limbs stay attached and both soles stay on the grip. */
function assertIntact(visual:Visual,label:string,planted=true) {
  visual.root.updateMatrixWorld(true);
  const end=(name:string,y:number)=>visual.root.getObjectByName(name)!.localToWorld(new THREE.Vector3(0,y,0));
  for(const side of [-1,1]) {
    const foot=visual.root.getObjectByName(`foot-${side}`)!,ankle=foot.localToWorld(new THREE.Vector3(0,0.06,0));
    const knee=world(visual,`knee-${side}`);
    assert.ok(end(`shin-${side}`,0.5).distanceTo(ankle)<1e-6,`${label}: shin left the ankle`);
    assert.ok(Math.abs(end(`shin-${side}`,-0.5).distanceTo(end(`shin-${side}`,0.5))-RIDER.lowerLeg)<1e-6,`${label}: shin stretched`);
    assert.ok(end(`shin-${side}`,-0.5).distanceTo(knee)<1e-6,`${label}: knee detached`);
    if(planted) {
      const sole=visual.board.worldToLocal(foot.localToWorld(new THREE.Vector3(0,BOARD.soleBottom,0)));
      assert.ok(Math.abs(sole.y-BOARD.gripY)<1e-6,`${label}: sole left the grip`);
      assert.ok(visual.board.worldToLocal(knee.clone()).y>BOARD.gripY,`${label}: knee through the deck`);
    }
    const shoulder=world(visual,`shoulder-${side}`);
    const elbow=world(visual,`elbow-${side}`),hand=world(visual,`hand-${side}`);
    assert.ok(end(`upper-arm-${side}`,-0.5).distanceTo(shoulder)<1e-6,`${label}: shoulder detached`);
    assert.ok(Math.abs(shoulder.distanceTo(elbow)-0.25)<1e-6,`${label}: upper arm stretched`);
    assert.ok(Math.abs(elbow.distanceTo(hand)-0.24)<1e-6,`${label}: forearm stretched`);
    assert.ok(end(`forearm-${side}`,0.5).distanceTo(hand)<1e-6,`${label}: hand detached`);
  }
}

test('the chest and head lean toward the rotation for W/S/A/D whether facing regular, switch or sideways',()=>{
  // Course runs down -Z with screen right at +X.
  const keys:[string,number,number,THREE.Vector3][]=[['W',1,0,new THREE.Vector3(0,0,-1)],['S',-1,0,new THREE.Vector3(0,0,1)],
    ['D',0,1,new THREE.Vector3(1,0,0)],['A',0,-1,new THREE.Vector3(-1,0,0)],
    ['W+D',1,1,new THREE.Vector3(1,0,-1).normalize()],['S+A',-1,-1,new THREE.Vector3(-1,0,1).normalize()]];
  for(const mode of ['skate','snowboard'] as const) for(const heading of [0,Math.PI,Math.PI/2,-Math.PI/2,0.6]) {
    const neutral=createSkaterVisual(mode);neutral.root.rotation.y=heading;
    for(let i=0;i<120;i++)neutral.setPose(air);
    for(const [key,pitch,roll,toward] of keys) {
      const rotation=createAirRotation();
      for(let i=0;i<60;i++)rotation.update(dt,i===0,pitch,roll,true,heading);
      assert.ok(Math.abs(Math.hypot(rotation.lean.pitch,rotation.lean.roll)-1)<0.01);
      // Hold the body level to compare against the neutral air pose; the lean itself is body-local.
      const visual=createSkaterVisual(mode);visual.root.rotation.y=heading;
      for(let i=0;i<120;i++) {visual.setPose({...air,flipLean:rotation.lean});assertIntact(visual,`${key} ${heading}`);}
      for(const part of ['chest','head']) {
        const moved=world(visual,part).sub(world(neutral,part)),flat=moved.clone().setY(0);
        assert.ok(flat.length()>0.03,`${key} facing ${heading}: ${part} barely moved`);
        assert.ok(flat.normalize().dot(toward)>0.85,`${key} facing ${heading}: ${part} leaned the wrong way`);
        assert.ok(moved.length()<0.5,`${key} facing ${heading}: ${part} lean is cartoonish`);
      }
      // Hips and knees tuck under the throw rather than the torso hinging alone.
      assert.ok(neutral.captureRagdoll().parts[0]!.center.y-visual.captureRagdoll().parts[0]!.center.y>0.02,`${key}: no tuck`);
    }
  }
});

test('the lean eases in and out with the rotation, and settles to neutral after stopping or landing',()=>{
  for(const lean of LEANS) {
    const visual=createSkaterVisual(),control=createSkaterVisual(),torso=torsoOf(visual);
    const head=visual.root.getObjectByName('head')!;
    const step=(pose:Parameters<Visual['setPose']>[0],flip?:{pitch:number;roll:number})=>{
      const before=torso.quaternion.clone(),neck=head.quaternion.clone(),plain=torsoOf(control).quaternion.clone();
      visual.setPose({...pose,flipLean:flip});control.setPose(pose);
      // Beyond whatever the ordinary pose does on this frame (a touchdown moves it too).
      const maxStep=Math.hypot(FLIP_LEAN.forward,FLIP_LEAN.side)*(1-Math.exp(-FLIP_LEAN.ease*dt))+.03;
      assert.ok(before.angleTo(torso.quaternion)-plain.angleTo(torsoOf(control).quaternion)<maxStep,'torso snapped');
      assert.ok(neck.angleTo(head.quaternion)<0.065,'neck snapped');
      assertIntact(visual,'easing');
    };
    for(let i=0;i<60;i++) {visual.setPose(air);control.setPose(air);}
    step(air,lean);
    const first=torso.quaternion.angleTo(torsoOf(control).quaternion);

    for(let i=0;i<120;i++)step(air,lean);
    const full=torso.quaternion.angleTo(torsoOf(control).quaternion);
    assert.ok(full>0.5 && full<0.9,`full lean ${full}`);
    assert.ok(first>0 && first<full*.25,'the first step should cover only a small part of the full lean');
    // The neck bends only slightly further than the chest.
    const neck=head.quaternion.angleTo(control.root.getObjectByName('head')!.quaternion);
    assert.ok(neck<0.26,`neck cranked by ${neck}`);
    // Half rate, half lean.
    for(let i=0;i<120;i++)step(air,{pitch:lean.pitch/2,roll:lean.roll/2});
    const half=torso.quaternion.angleTo(torsoOf(control).quaternion);
    assert.ok(Math.abs(half-full/2)<0.03);
    // Back to steering mid-air: rotation stops, the lean eases out completely.
    for(let i=0;i<240;i++)step(air,{pitch:0,roll:0});
    assert.ok(torso.quaternion.angleTo(torsoOf(control).quaternion)<1e-6);
    // Touch down while still rotating, then allow the slower arm follow-through to settle.
    for(let i=0;i<120;i++)step({...air,verticalSpeed:-6},lean);
    for(let i=0;i<240;i++)step({...air,airborne:false},i<2?lean:{pitch:0,roll:0});
    // Exponentially damped arm follow-through can retain micrometre differences.
    for(const name of ['chest','head','knee--1','knee-1','hand--1','hand-1'])
      assert.ok(world(visual,name).distanceTo(world(control,name))<1e-4,`${name} kept ${world(visual,name).distanceTo(world(control,name))} m of lean after landing (${lean.pitch}, ${lean.roll})`);
    assert.ok(torso.quaternion.angleTo(torsoOf(control).quaternion)<1e-6);
    visual.setPose({...air,flipLean:lean});visual.resetPose();control.resetPose();
    visual.setPose({...air,airborne:false});control.setPose({...air,airborne:false});
    assert.ok(torso.quaternion.angleTo(torsoOf(control).quaternion)<1e-6);
  }
});

test('a short flip input makes the shoulders lean while the arms stay relaxed within 150 ms',()=>{
  for(const mode of ['skate','snowboard'] as const) for(const [pitch,roll] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const visual=createSkaterVisual(mode),neutral=createSkaterVisual(mode),rotation=createAirRotation();
    for(let i=0;i<120;i++){visual.setPose(air);neutral.setPose(air);}
    for(let i=0;i<18;i++) {
      rotation.update(dt,i===0,pitch!,roll!,true);
      visual.setPose({...air,flipLean:rotation.lean});neutral.setPose(air);
      assertIntact(visual,'short flip input');
    }
    const angle=torsoOf(visual).quaternion.angleTo(torsoOf(neutral).quaternion);
    assert.ok(angle>0.35 && angle<0.65,`150 ms lean should be readable without snapping: ${angle}`);
    for(const side of [-1,1]) {
      const shoulder=(v:Visual)=>world(v,`shoulder-${side}`);
      assert.ok(shoulder(visual).distanceTo(shoulder(neutral))>0.08,'shoulder did not follow the throw');
      const reach=(v:Visual)=>world(v,`hand-${side}`).distanceTo(shoulder(v));
      assert.ok(reach(visual)>=reach(neutral)-0.005,'flip should preserve the relaxed elbow');
    }
  }
});

test('flip arms retain a relaxed reach and soft elbows in every direction',()=>{
  for(const mode of ['skate','snowboard'] as const) for(const lean of LEANS) {
    const visual=createSkaterVisual(mode),neutral=createSkaterVisual(mode);
    for(let i=0;i<120;i++){visual.setPose(air);neutral.setPose(air);}
    for(let i=0;i<120;i++) {
      visual.setPose({...air,flipLean:lean});neutral.setPose(air);
      assertIntact(visual,'extended flip arms');
    }
    for(const side of [-1,1]) {
      const extension=(v:Visual)=>{
        const hand=world(v,`hand-${side}`);
        return world(v,`shoulder-${side}`).distanceTo(hand);
      };
      const reach=extension(visual);
      assert.ok(reach>0.43 && reach<0.489,`flip elbow should be softly extended: ${reach}`);
      assert.ok(reach>=extension(neutral)-.015,'flip should retain the relaxed air stance');
    }
  }
});

test('framerate does not change how the lean eases',()=>{
  const slow=createSkaterVisual(),fast=createSkaterVisual(),lean={pitch:-1,roll:0.4};
  for(let i=0;i<12;i++)slow.setPose({...air,dt:1/60,flipLean:lean});
  for(let i=0;i<48;i++)fast.setPose({...air,dt:1/240,flipLean:lean});
  assert.ok(Math.abs(torsoOf(slow).rotation.x-torsoOf(fast).rotation.x)<0.01);
  assert.ok(Math.abs(torsoOf(slow).rotation.z-torsoOf(fast).rotation.z)<0.01);
});

test('grabs and board tricks stay sane while leaning into a flip',()=>{
  for(const mode of ['skate','snowboard'] as const) for(const grab of Object.values(GRABS)) for(const lean of LEANS) {
    const visual=createSkaterVisual(mode),label=`${grab.name} ${lean.pitch},${lean.roll}`;
    for(let i=0;i<240;i++) {
      visual.setPose({...air,grab,flipLean:i<40?undefined:lean});assertIntact(visual,label);
      const pelvis=visual.captureRagdoll().parts.find(p=>p.id==='pelvis')!;
      if(grab.direction==='back') for(const side of [-1,1])
        assert.ok(world(visual,`knee-${side}`).y<pelvis.center.y-0.06,`${label}: knee above hip`);
    }
    const expected=visual.board.localToWorld(new THREE.Vector3(grab.grip.x,grab.grip.y,grab.grip.z).applyAxisAngle(up,RIDER.stanceY));
    const miss=world(visual,`hand-${grab.hand}`).distanceTo(expected);
    assert.ok(miss<0.025,`${label}: hand missed by ${miss}`);
  }
  for(const [dx,dy] of [[-80,0],[80,0],[0,-80],[0,80],[-80,-80],[80,-80]]) for(const lean of LEANS) {
    const visual=createSkaterVisual(),tricks=createTrickSystem();
    tricks.tryFlick(dx!,dy!,true);const trick=tricks.state.active!;
    for(let i=0;i<50 && tricks.state.active;i++) {
      tricks.update(dt,false,1,30);
      visual.setPose({...air,trick,trickTime:tricks.state.t,boardSpin:tricks.state.boardSpin,flipLean:lean});
      assertIntact(visual,`${trick.id} ${lean.pitch},${lean.roll}`,false);
    }
  }
});

test('a backward grab held through a backward flip arches less than the grab and lean combined',()=>{
  const settle=(grab:typeof GRABS.tomahawk|null,pitch:number)=>{
    const visual=createSkaterVisual();
    for(let i=0;i<300;i++)visual.setPose({...air,grab,flipLean:{pitch,roll:0}});
    return visual;
  };
  const plain=torsoOf(settle(null,0)).rotation.x,leanOnly=torsoOf(settle(null,1)).rotation.x-plain;
  const grabbed=settle(GRABS.tomahawk,0),both=settle(GRABS.tomahawk,1);
  const grabOnly=torsoOf(grabbed).rotation.x,combined=torsoOf(both).rotation.x;
  assert.ok(leanOnly>0.15 && leanOnly<=FLIP_LEAN.back+1e-9);
  assert.ok(Math.abs(grabOnly-GRABS.tomahawk.tweak.chestPitch)<1e-6,'the grab is unchanged when not flipping');
  assert.ok(combined<grabOnly+leanOnly-0.15,`combined arch ${combined} is close to the naive ${grabOnly+leanOnly}`);
  assert.ok(Math.abs(combined-grabOnly)<0.06,`flipping grab ${combined} should arch about as far as the grab alone`);
  // The board is not hauled as far behind either, and softening is proportional to the backward lean.
  assert.ok(both.board.position.length()<grabbed.board.position.length());
  const half=torsoOf(settle(GRABS.tomahawk,0.5)).rotation.x;
  assert.ok(Math.abs(half-(grabOnly+combined)/2)<0.02);
  // A forward or sideways flip leaves the grab itself as it was.
  for(const lean of [{pitch:-1,roll:0},{pitch:0,roll:1},{pitch:0,roll:-1}]) {
    const visual=createSkaterVisual();
    for(let i=0;i<300;i++)visual.setPose({...air,grab:GRABS.tomahawk,flipLean:lean});
    assert.ok(visual.board.position.distanceTo(grabbed.board.position)<1e-9);
  }
  // The deck still clears the chest through the softened hold.
  const visual=createSkaterVisual(),chest=visual.root.getObjectByName('chest')!;
  for(let frame=0;frame<240;frame++) {
    visual.setPose({...air,grab:GRABS.tomahawk,flipLean:{pitch:Math.min(1,frame/60),roll:0}});
    visual.root.updateMatrixWorld(true);
    for(const x of [-0.10,0,0.10]) for(let z=-0.38;z<=0.38;z+=0.038) {
      const point=chest.worldToLocal(visual.board.localToWorld(new THREE.Vector3(x,0.01,z)));
      assert.ok(Math.abs(point.y)>0.19 || Math.hypot(point.x,point.z)>0.17,`deck penetrates chest at frame ${frame}`);
    }
  }
});

const idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
  wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};

test('in play the rider leans down the course on W in either stance, and straightens on leaving flip mode',async()=>{
  await RAPIER.init();
  for(const switchStance of [false,true]) {
    const scene=new THREE.Scene(),physics=new RAPIER.World({x:0,y:-18,z:0});physics.timestep=dt;
    const ground=physics.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-0.1,-400));
    physics.createCollider(RAPIER.ColliderDesc.cuboid(50,0.1,500),ground);
    const anchor=new THREE.Vector3(),spawn=new THREE.Vector3(0,0.02,0);
    const ramp:RampWorld={mesh:new THREE.Group(),spawn,anchor,surfaceOrigin:anchor,endZ:-99999,
      surfaceNormal:up.clone(),forward:new THREE.Vector3(0,0,-1),distance:0,grindRails:[],
      scroll:meters=>new THREE.Vector3(0,0,meters),reset:()=>{},prepareNextChunk:()=>true,flushDeferredDestroy:()=>{}};
    const player=createBoardPlayer(scene,physics,ramp),tricks=createTrickSystem();
    player.reset(spawn.clone().addScaledVector(up,80));
    const tick=(intent:PlayerIntent=idle)=>{
      player.update(dt,intent,tricks.state);
      if(!player.crashed)tricks.update(dt,player.grounded,player.uprightDot,player.speed);
      physics.step();player.sync();
    };
    // Chest position in the tumbling body's own frame, so the whole-body rotation drops out.
    const chest=()=>{
      player.mesh.updateMatrixWorld(true);
      return player.mesh.worldToLocal(player.mesh.getObjectByName('chest')!.getWorldPosition(new THREE.Vector3()));
    };
    tick();
    for(let i=0;i<110 && switchStance;i++)tick({...idle,steer:player.forward.z<0.999?1:0});
    for(let i=0;i<80;i++)tick();
    const rest=chest();
    for(let i=0;i<40;i++)tick({...idle,push:1,toggleAirFlip:i===0});
    // Board-local -Z is the nose: down the course riding regular, back up it riding switch.
    const lean=chest().sub(rest);
    assert.ok(switchStance ? lean.z>0.04 : lean.z<-0.04,`chest did not lead the frontflip, switch=${switchStance}: ${lean.z}`);
    assert.ok(Math.abs(lean.x)<Math.abs(lean.z)*0.5,`chest should lead mainly down the course: ${lean.toArray()}`);
    for(let i=0;i<90;i++)tick({...idle,push:1,toggleAirFlip:i===0});
    assert.equal(player.aerial.active,false);assert.equal(player.grounded,false);
    assert.ok(chest().distanceTo(rest)<0.008,'lean remained after returning to steering');
    physics.free();
  }
});
