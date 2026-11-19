import type {TestContext} from 'node:test';
import {AIR_YAW_SPEED} from '../src/player/movement/airRotation.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { BOARD, GRIND_HEIGHT } from '../src/player/dimensions.ts';
import { createGrindSystem, GRIND, type GrindRail } from '../src/player/movement/grind.ts';
import { createBoardPlayer } from '../src/player/board.ts';
import { createTrickSystem } from '../src/player/tricks/tricks.ts';
import type { PlayerIntent } from '../src/player/controller.ts';
import type { RampWorld } from '../src/world/ramp.ts';
import { MPH_PER_MPS } from '../src/player/movement/speed.ts';

const dt = 1 / 120;
const normal = new THREE.Vector3(0, 1, 0), forward = new THREE.Vector3(0, 0, -1), right = new THREE.Vector3(1, 0, 0);
const rails = [{ id: 'test', start: new THREE.Vector3(0, 1, 0), end: new THREE.Vector3(0, 1, -20) }];
const top = 1 + GRIND_HEIGHT;
/** Nose direction turned `degrees` from the rail toward +X. */
const facing = (degrees: number) => forward.clone().applyAxisAngle(normal, -THREE.MathUtils.degToRad(degrees));

/** Drives the bare grind system the way the physics step does: it sets a velocity, the world integrates it. */
function ride(options: { x?: number; y?: number; z?: number; degrees?: number; velocity?: THREE.Vector3 } = {}) {
  const grind = createGrindSystem(), nose = facing(options.degrees ?? 0);
  const position = new THREE.Vector3(options.x ?? 0, top + (options.y ?? 0.05), options.z ?? -3);
  const velocity = options.velocity ?? new THREE.Vector3(0, -1, -15);
  const step = (steer = 0, ollie = false, braking = false, canCatch = true) => {
    const owned = grind.update(dt, position, velocity, nose, normal, rails, steer, ollie, braking, canCatch);
    if (grind.state.active) nose.copy(grind.heading);
    position.addScaledVector(velocity, dt);
    return owned;
  };
  return { grind, position, velocity, nose, step };
}
const caught = (options: Parameters<typeof ride>[0]) => { const r = ride(options); r.step(); return r.grind.state; };

test('the grind is chosen from how the board meets the rail, with no input', () => {
  // Along the rail: both trucks over it, or only the one that came down on it.
  assert.equal(caught({}).name, '50-50');
  assert.equal(caught({ x: 0.15 }).name, '50-50');
  assert.equal(caught({ degrees: 30 }).name, '50-50', 'a centred board keeps both trucks on at an angle');
  const reach = BOARD.truckZ * Math.sin(THREE.MathUtils.degToRad(24));
  assert.equal(caught({ degrees: 24, x: -reach }).name, 'Nosegrind');
  assert.equal(caught({ degrees: 24, x: reach }).name, '5-0');
  assert.equal(caught({ degrees: -24, x: reach }).name, 'Nosegrind');
  assert.equal(caught({ degrees: -24, x: -reach }).name, '5-0');
  // Landing with only one truck past the start of the rail.
  assert.equal(caught({ z: 0.1 }).name, 'Nosegrind');
  assert.equal(caught({ z: -19.9 }).name, '5-0');
  // Across the rail: named by the part of the deck over it.
  assert.equal(caught({ degrees: 90 }).name, 'Boardslide');
  assert.equal(caught({ degrees: -90, x: 0.1 }).name, 'Boardslide');
  assert.equal(caught({ degrees: 70, x: 0.1 }).name, 'Boardslide');
  assert.equal(caught({ degrees: 90, x: -0.33 }).name, 'Noseslide');
  assert.equal(caught({ degrees: 90, x: 0.33 }).name, 'Tailslide');
  assert.equal(caught({ degrees: -90, x: 0.33 }).name, 'Noseslide');
  assert.equal(caught({ degrees: -90, x: -0.33 }).name, 'Tailslide');
  // In-between angles go to the nearer family.
  assert.equal(caught({ degrees: 40 }).name, '50-50');
  assert.equal(caught({ degrees: 50 }).name, 'Boardslide');
});

test('switch and uphill travel name truck grinds by the truck leading the travel', () => {
  const reach = BOARD.truckZ * Math.sin(THREE.MathUtils.degToRad(24));
  assert.equal(caught({ degrees: 180 }).name, '50-50');
  // Riding switch the tail-side truck leads, so landing on it is the nosegrind.
  assert.equal(caught({ degrees: 204, x: -reach }).name, 'Nosegrind');
  assert.equal(caught({ degrees: 204, x: reach }).name, '5-0');
  const uphill = () => new THREE.Vector3(0, -1, 15);
  assert.equal(caught({ velocity: uphill() }).name, '50-50');
  assert.equal(caught({ degrees: 24, x: -reach, velocity: uphill() }).name, '5-0');
  assert.equal(caught({ degrees: 204, x: reach, velocity: uphill() }).name, 'Nosegrind');
  assert.equal(caught({ degrees: 90, velocity: uphill() }).name, 'Boardslide');
  const r = ride({ z: -15, velocity: uphill() });
  for (let i = 0; i < 30; i++) r.step();
  assert.ok(r.grind.state.active); assert.ok(r.velocity.z > 14);
});

test('the catch window is wider than before but still bounded', () => {
  const hit = (options: Parameters<typeof ride>[0]) => caught(options).active;
  // Formerly 0.30 m to the side and 0.22 m above.
  assert.ok(hit({ x: 0.35 })); assert.ok(hit({ x: -0.35 }));
  assert.ok(!hit({ x: 0.4 })); assert.ok(!hit({ x: -0.4 }));
  assert.ok(hit({ y: GRIND.above - 0.01 })); assert.ok(!hit({ y: GRIND.above + 0.02 }));
  assert.ok(hit({ y: -GRIND.below + 0.01 })); assert.ok(!hit({ y: -GRIND.below - 0.02 }));
  // Sideways, the rail has to be under the deck.
  assert.ok(hit({ degrees: 90, x: 0.4 })); assert.ok(!hit({ degrees: 90, x: 0.46 }));
  // Neither truck near the rail: an angled board well off to the side.
  assert.ok(!hit({ degrees: 30, x: 0.5 }));
  // Off the ends, from the road, from far above, or still rising.
  assert.ok(!hit({ z: 0.3 })); assert.ok(!hit({ z: -20.3 }));
  assert.ok(!hit({ x: 1 })); assert.ok(!hit({ y: -0.8 })); assert.ok(!hit({ y: 2 }));
  assert.ok(!hit({ velocity: new THREE.Vector3(0, 3, -15) }));
  assert.ok(!hit({ velocity: new THREE.Vector3(0, -1, -1) }), 'needs some speed');
  const blocked = ride({});
  assert.equal(blocked.step(0, false, false, false), false);
});

test('a catch eases the board onto the rail instead of snapping it', () => {
  for (const options of [{ x: 0.3 }, { x: -0.2, degrees: 24 }, { degrees: 60, x: 0.1 }, { degrees: 90, x: -0.3 }, { y: 0.15 }, { y: -0.1 }]) {
    const r = ride(options), before = r.position.clone();
    let previous = before.clone(), heading = r.nose.clone();
    for (let i = 0; i < 120; i++) {
      const speed = r.velocity.length();
      r.step();
      assert.ok(r.grind.state.active);
      // Beyond the velocity's own motion, only the pivot about the contact point moves the board.
      assert.ok(r.position.distanceTo(previous) < speed * dt + 0.02, `jumped ${r.position.distanceTo(previous)} at ${i}`);
      assert.ok(r.nose.angleTo(heading) < 0.045, `turned ${r.nose.angleTo(heading)} at ${i}`);
      previous.copy(r.position); heading.copy(r.nose);
    }
    // Settled: the supporting part of the board is on the rail line.
    const slide = r.grind.state.name.endsWith('slide');
    assert.ok(Math.abs(Math.abs(r.nose.dot(slide ? right : forward)) - 1) < 1e-4);
    const end = r.grind.state.name === 'Boardslide' || r.grind.state.name === '50-50' ? 0
      : slide ? GRIND.slideEnd : BOARD.truckZ;
    assert.ok(Math.abs(Math.abs(r.position.x) - (slide ? end : 0)) < 2e-3, `${r.grind.state.name} rests at x=${r.position.x}`);
    assert.ok(r.velocity.z < -13); assert.ok(Math.abs(r.velocity.x) < 0.01); assert.ok(Math.abs(r.velocity.y) < 0.01);
  }
});

test('landing aligned on a rail locks trucks and keeps longitudinal momentum', () => {
  const r = ride({ x: 0.15, y: 0.15, velocity: new THREE.Vector3(0, -2, -15) });
  assert.ok(r.step()); assert.ok(r.grind.state.active);
  for (let i = 0; i < 90; i++) r.step();
  assert.ok(Math.abs(r.position.x) < 1e-3); assert.ok(Math.abs(r.position.y - top) < 1e-6);
  assert.ok(r.velocity.z < -14.5); assert.equal(r.velocity.y, 0);
  assert.ok(r.grind.state.meters > 10);
  assert.equal(r.grind.state.message, '50-50');
});

test('the board drops onto the rail under gravity and stops on it without sinking', () => {
  const r = ride({ y: 0.17, velocity: new THREE.Vector3(0, -6, -15) });
  let lowest = Infinity;
  for (let i = 0; i < 40; i++) { r.step(); lowest = Math.min(lowest, r.position.y); }
  assert.ok(lowest > top - 1e-6); assert.ok(Math.abs(r.position.y - top) < 1e-6);
});

test('grind ollie exits, cooldown prevents reattachment, and rail ends release', () => {
  const r = ride({});
  for (let i = 0; i < 30; i++) r.step();
  const before = r.position.clone(), along = r.velocity.z;
  r.position.addScaledVector(r.velocity, -dt);
  assert.ok(r.step(0, true));
  assert.equal(r.grind.state.active, false); assert.equal(r.grind.state.message, 'Ollie out');
  assert.ok(Math.abs(r.velocity.y - GRIND.pop) < 1e-9); assert.ok(Math.abs(r.velocity.z - along) < 0.1);
  assert.equal(r.grind.state.name, '50-50', 'the name outlives the grind for scoring');
  assert.ok(r.grind.state.meters > 3);
  r.position.copy(before); r.velocity.y = -1;
  assert.equal(r.step(), false);
  assert.equal(r.grind.state.active, false);
  const end = ride({ z: -19.6 });
  end.step(); assert.ok(end.grind.state.active);
  for (let i = 0; i < 6; i++) end.step();
  assert.equal(end.grind.state.active, false); assert.equal(end.grind.state.message, 'Grind complete');
  assert.ok(end.velocity.z < -14.5, 'riding off the end keeps its speed');
});

test('overbalancing drops off a rail; slides balance the same way and drag a little more', () => {
  for (const degrees of [0, 180, 90]) {
    const r = ride({ degrees });
    r.step(); assert.ok(r.grind.state.active);
    for (let i = 0; i < 80; i++) r.step(1, false, false, false);
    assert.equal(r.grind.state.active, false); assert.equal(r.grind.state.message, 'Slipped off');
    assert.ok(r.velocity.x > 1.5, 'slips toward the side that was held');
  }
  const truck = ride({}), deck = ride({ degrees: 90 }), braked = ride({});
  for (let i = 0; i < 120; i++) { truck.step(); deck.step(); braked.step(0, false, true); }
  assert.ok(deck.velocity.z > truck.velocity.z && deck.velocity.z < truck.velocity.z + 1.5);
  assert.ok(braked.velocity.z > -1 || !braked.grind.state.active);
});

test('graded rails constrain the trucks and ollie exit to their own surface normal',()=>{
  for(const pitch of [-0.2,0.2]) {
    const tangent=forward.clone().applyAxisAngle(new THREE.Vector3(1,0,0),pitch);
    const up=normal.clone().applyAxisAngle(new THREE.Vector3(1,0,0),pitch);
    const rail={id:'grade',start:new THREE.Vector3(0,3,0),end:tangent.clone().multiplyScalar(20).add(new THREE.Vector3(0,3,0)),normal:up};
    const position=rail.start.clone().addScaledVector(tangent,3).addScaledVector(up,GRIND_HEIGHT+0.02);
    const velocity=tangent.clone().multiplyScalar(18).addScaledVector(up,-1), grind=createGrindSystem();
    for(let i=0;i<20;i++) {
      assert.ok(grind.update(dt,position,velocity,tangent,normal,[rail],0,false,false,true));
      position.addScaledVector(velocity,dt);
    }
    assert.ok(Math.abs(position.clone().sub(rail.start).dot(up)-GRIND_HEIGHT)<1e-6);
    assert.ok(Math.abs(velocity.dot(up))<1e-6);
    grind.update(dt,position,velocity,tangent,normal,[rail],0,true,false,true);
    assert.ok(Math.abs(velocity.dot(up)-6.5)<1e-6);
  }
});

test('rail slides retain speeds above the former 199 mph cap and slow progressively',()=>{
  const grind=createGrindSystem(),position=new THREE.Vector3(0,1+GRIND_HEIGHT,-3);
  const startSpeed=250/MPH_PER_MPS,velocity=forward.clone().multiplyScalar(startSpeed).addScaledVector(normal,-1);
  grind.update(dt,position,velocity,forward,normal,rails,0,false,false,true);
  assert.ok(grind.state.active);
  assert.ok(velocity.length()*MPH_PER_MPS>249);
  assert.ok(velocity.length()<startSpeed);
});

// --- the real board player on a physical rail ---
const idle:PlayerIntent={grabModifier:false,grabDX:0,grabDY:0,push:0,steer:0,crouch:false,crouchHold:0,
  wantOllie:false,olliePower:0,reset:false,flickDX:0,flickDY:0,flickReady:false};
const RAIL_Y=0.75;

/** A rider dropped onto a 20 m rail, turned in the air by steering alone. `degrees` is the measured approach heading. */
async function approach(t:TestContext,degrees:number,x:number,speed=15) {
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:-18,z:0});world.timestep=dt;
  t.after(()=>world.free());
  const ground=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,-0.1,0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(50,0.1,500),ground);
  const bar=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0,RAIL_Y-0.07,-15));
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.08,0.07,10),bar);
  const rail:GrindRail={id:'rail',start:new THREE.Vector3(0,RAIL_Y,-5),end:new THREE.Vector3(0,RAIL_Y,-25),normal:normal.clone()};
  const anchor=new THREE.Vector3(),spawn=new THREE.Vector3(0,0.02,0);
  const ramp:RampWorld={mesh:new THREE.Group(),spawn,anchor,surfaceOrigin:anchor,endZ:-99999,
    surfaceNormal:new THREE.Vector3(0,1,0),forward:new THREE.Vector3(0,0,-1),distance:0,grindRails:[rail],
    scroll:()=>new THREE.Vector3(),reset:()=>{},prepareNextChunk:()=>true,flushDeferredDestroy:()=>{}};
  const player=createBoardPlayer(new THREE.Scene(),world,ramp),tricks=createTrickSystem();
  const board=player.mesh,last=new THREE.Vector3(),lastQ=new THREE.Quaternion(),moved=new THREE.Vector3();
  let worstJump=0,worstTurn=0;
  const tick=(intent:PlayerIntent=idle)=>{
    last.copy(board.position);lastQ.copy(board.quaternion);
    player.update(dt,intent,tricks.state);world.step();player.sync();
    assert.equal(player.crashed,false,`crashed: ${player.crashCause}`);
    // The visible board only ever moves by its velocity, plus the slow pivot onto the rail.
    worstJump=Math.max(worstJump,moved.copy(board.position).sub(last).addScaledVector(player.velocity,-dt).length());
    worstTurn=Math.max(worstTurn,board.quaternion.angleTo(lastQ));
  };
  for(let i=0;i<90;i++)tick();
  const wheelOffset=board.position.y-player.position.y;
  player.body.setTranslation({x:0,y:30,z:0},true);player.body.setLinvel({x:0,y:0,z:0},true);
  tick();
  const target=THREE.MathUtils.degToRad(degrees);
  let turned=0,previousHeading=0;
  for(let i=0;i<300 && Math.abs(target-turned)>1e-6;i++) {
    tick({...idle,steer:THREE.MathUtils.clamp((target-turned)/(AIR_YAW_SPEED*dt),-1,1)});
    const heading=Math.atan2(player.forward.x,-player.forward.z);
    turned+=Math.atan2(Math.sin(heading-previousHeading),Math.cos(heading-previousHeading));previousHeading=heading;
  }
  assert.ok(Math.abs(target-turned)<1e-6,`could not steer to ${degrees} degrees`);
  // Place the visible trucks 10 cm above the rail, 3 m in, already travelling along it.
  player.body.setTranslation({x,y:RAIL_Y+GRIND_HEIGHT+0.1-wheelOffset,z:-8},true);
  player.body.setLinvel({x:0,y:-1.5,z:-speed},true);
  player.sync();
  const measure=()=>{worstJump=worstTurn=0;};
  const nose=()=>new THREE.Vector3(0,0,-1).applyQuaternion(board.quaternion);
  const up=()=>new THREE.Vector3(0,1,0).applyQuaternion(board.quaternion);
  return {world,player,tricks,board,tick,measure,nose,up,get worstJump(){return worstJump;},get worstTurn(){return worstTurn;}};
}

const turned=THREE.MathUtils.degToRad(24),truckReach=BOARD.truckZ*Math.sin(turned);
// approach angle in degrees, sideways offset, expected grind, contact point on the board (toward nose, below origin)
const APPROACHES:[string,number,number,number,number][]=[
  ['50-50',0,0.12,0,GRIND_HEIGHT],
  ['Nosegrind',24,-truckReach,BOARD.truckZ,GRIND_HEIGHT],
  ['5-0',24,truckReach,-BOARD.truckZ,GRIND_HEIGHT],
  ['Boardslide',90,0.08,0,GRIND.slideHeight],
  ['Noseslide',90,-0.33,GRIND.slideEnd,GRIND.slideEndHeight],
  ['Tailslide',90,0.33,-GRIND.slideEnd,GRIND.slideEndHeight],
  ['50-50',180,-0.1,0,GRIND_HEIGHT],
  ['Nosegrind',204,-truckReach,-BOARD.truckZ,GRIND_HEIGHT],
  ['Boardslide',-90,0,0,GRIND.slideHeight],
];
const JUMP=0.02,TURN=THREE.MathUtils.degToRad(4);

test('every grind is caught from the approach alone, settles on the rail and pops out without a jump',async(t)=>{
  for(const [name,turn,x,reach,height] of APPROACHES) {
    const f=await approach(t,turn,x),label=`${name} (${turn} degrees)`;
    f.measure();
    let waited=0;
    while(!f.player.grind.active && waited++<20)f.tick();
    assert.ok(f.player.grind.active,`${label} was not caught`);
    assert.equal(f.player.grind.name,name,label);
    for(let i=0;i<70;i++) { f.tick(); assert.ok(f.player.grind.active,`${label} lost at ${i}`); }
    assert.ok(f.worstJump<JUMP,`${label} jumped ${f.worstJump} m on the catch`);
    assert.ok(f.worstTurn<TURN,`${label} turned ${f.worstTurn} rad in a tick on the catch`);
    // The part of the visible board that carries the grind is on the rail line.
    const contact=f.board.position.clone().addScaledVector(f.nose(),reach).addScaledVector(f.up(),-height);
    assert.ok(Math.abs(contact.x)<4e-3 && Math.abs(contact.y-RAIL_Y)<4e-3,`${label} contact at ${contact.x}, ${contact.y-RAIL_Y}`);
    const slide=name.endsWith('slide'),heading=f.nose();
    assert.ok(Math.abs(slide ? heading.x : heading.z)>0.97,`${label} heading`);
    // Truck grinds pitch about the supporting truck; everything else stays level on the rail.
    const pitch=Math.asin(heading.y);
    if(name==='50-50' || slide)assert.ok(Math.abs(pitch)<0.01,label);
    else assert.ok(Math.abs(pitch+Math.sign(reach)*GRIND.tilt)<0.01,`${label} pitch ${pitch}`);
    assert.ok(f.player.velocity.z<-13.5,`${label} kept ${f.player.velocity.z} m/s`);
    assert.ok(f.player.grind.meters>7);

    f.measure();
    const before=heading.clone(),along=f.player.velocity.z;
    f.tick({...idle,wantOllie:true,olliePower:0.5});
    assert.equal(f.player.grind.active,false);assert.equal(f.player.ollieCount,1);
    assert.ok(f.player.velocity.y>5.5,label);
    assert.ok(Math.abs(f.player.velocity.z-along)<0.2,`${label} lost speed on the pop`);
    assert.ok(f.nose().angleTo(before)<TURN,`${label} was turned by the pop`);
    for(let i=0;i<40;i++)f.tick();
    assert.ok(f.worstJump<JUMP,`${label} jumped ${f.worstJump} m on the ollie`);
    assert.ok(f.worstTurn<TURN,`${label} turned ${f.worstTurn} rad in a tick on the ollie`);
    // A slide leaves sideways and stays that way until the rider turns it.
    assert.ok(Math.abs(slide ? f.nose().x : f.nose().z)>0.97,`${label} heading after the pop`);
    assert.ok(Math.abs(Math.asin(f.nose().y))<0.03,`${label} levels out in the air`);
    assert.equal(f.player.grind.name,name);
  }
});

test('riding off the end and losing balance leave the rail without a jump',async(t)=>{
  for(const [name,turn,x] of APPROACHES.slice(0,6)) {
    const end=await approach(t,turn,x,30);
    end.measure();
    for(let i=0;i<110 && (i<5 || end.player.grind.active);i++)end.tick();
    for(let i=0;i<15;i++)end.tick();
    assert.equal(end.player.grind.active,false,name);assert.equal(end.player.grind.message,'Grind complete');
    assert.ok(end.worstJump<JUMP,`${name} jumped ${end.worstJump} m off the end`);
    assert.ok(end.worstTurn<TURN,`${name} turned ${end.worstTurn} rad off the end`);
    assert.ok(end.player.velocity.z<-27,name);

    const slip=await approach(t,turn,x);
    slip.measure();
    for(let i=0;i<30;i++)slip.tick();
    assert.ok(slip.player.grind.active,name);
    for(let i=0;i<90 && slip.player.grind.active;i++)slip.tick({...idle,steer:1});
    // Past this the loose board drops back onto the steel, which is a real collision.
    for(let i=0;i<5;i++)slip.tick();
    assert.equal(slip.player.grind.active,false,name);assert.equal(slip.player.grind.message,'Slipped off');
    assert.ok(slip.worstJump<JUMP,`${name} jumped ${slip.worstJump} m slipping off`);
    assert.ok(slip.worstTurn<TURN,`${name} turned ${slip.worstTurn} rad slipping off`);
  }
});

test('a near miss beside or above the rail is not pulled in, and a board trick must be caught first',async(t)=>{
  const wide=await approach(t,0,0.45);
  for(let i=0;i<12;i++) { wide.tick(); assert.equal(wide.player.grind.active,false); }
  const spinning=await approach(t,0,0);
  spinning.tricks.state.active={id:'kickflip',name:'Kickflip',duration:0.45} as never;
  for(let i=0;i<3;i++) { spinning.tick(); assert.equal(spinning.player.grind.active,false); }
  spinning.tricks.state.active=null;
  spinning.tick();
  assert.ok(spinning.player.grind.active,'a caught board trick can land in a grind');
});
