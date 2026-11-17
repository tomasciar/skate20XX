import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTrickSystem} from '../src/player/tricks/tricks.ts';
import {SCORE,airPoints,createScore,flipPoints,grabPoints,grindKey,grindRate,trickPoints} from '../src/player/score.ts';
import type {RideSample} from '../src/player/score.ts';
import {highScoreKey,loadHighScore,saveHighScore} from '../src/highScore.ts';

const dt=1/120,TURN=Math.PI*2;
/** Distance is summed per tick, so totals that include it can land one point either side. */
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<=1,`${actual} is not about ${expected}`);
/** A trick system and scorer stepped together the way the game loop does. */
function createRun() {
  const tricks=createTrickSystem(),score=createScore();
  let distance=0;
  function tick(ride:Partial<RideSample>={},speed=0) {
    const sample={distance:distance+=speed*dt,grounded:true,crashed:false,...ride};
    const landing=sample.landing ?? null;
    tricks.state.landing=landing;
    if(!sample.crashed)tricks.update(dt,sample.grounded || !!sample.grind?.active,1,speed);
    score.step(tricks.state,{...sample,landing});
    if(tricks.state.bail)tricks.clearBail();
  }
  /** Flick in the air and stay up until the board is caught. */
  function flick(dx:number,dy:number,hold=0) {
    tricks.tryFlick(dx,dy,true);
    for(let i=0;i<600 && tricks.state.active;i++) {
      const down=i*dt<hold;tricks.holdFlick(down?dx:0,down?dy:0);tick({grounded:false});
    }
  }
  return {tricks,score,tick,flick};
}
/** Score of one air holding the given flicks, landed with `landing`. */
function landed(flicks:[number,number,number?][],landing:RideSample['landing']=null) {
  const run=createRun();
  run.tick({grounded:false});
  for(const [dx,dy,hold] of flicks)run.flick(dx,dy,hold);
  run.tick({landing});
  return run.score.total;
}

test('harder board tricks score higher',()=>{
  assert.ok(trickPoints('kickflip')>trickPoints('shoveit'));
  assert.ok(trickPoints('varial')>trickPoints('kickflip'));assert.ok(trickPoints('hardflip')>trickPoints('varial'));
  for(const id of Object.keys(SCORE.trick) as (keyof typeof SCORE.trick)[]) {
    for(let spins=1;spins<6;spins++)assert.ok(trickPoints(id,spins+1)>trickPoints(id,spins),`${id} x${spins+1}`);
    // More rotations are worth more than repeating the single.
    assert.ok(trickPoints(id,2)>2*trickPoints(id,1));
  }
  assert.ok(flipPoints(TURN,0)>trickPoints('hardflip'));assert.ok(flipPoints(TURN,TURN)>flipPoints(TURN,0));
  assert.ok(flipPoints(-2*TURN,0)>2*flipPoints(TURN,0));assert.equal(flipPoints(0,-TURN),SCORE.roll);
  assert.equal(flipPoints(TURN*0.4,0),0);assert.ok(flipPoints(4*TURN,0)>flipPoints(3*TURN,0));
  assert.equal(grabPoints(0.05),0);assert.ok(grabPoints(1)>grabPoints(0.3));assert.equal(grabPoints(60),grabPoints(SCORE.grabMaxHold));
});

test('landed tricks are scored from the trick system',()=>{
  const kickflip=landed([[-80,0]]);
  assert.equal(kickflip,SCORE.trick.kickflip);
  assert.equal(landed([[-80,0,0.33]]),SCORE.trick.kickflip*SCORE.spins[1]!);
  assert.equal(landed([[80,-80]]),SCORE.trick.hardflip);
  // A combo beats the same tricks landed one air at a time, and a graded landing beats a loose one.
  const combo=landed([[-80,0],[80,0],[-80,-80]]);
  assert.equal(combo,airPoints([SCORE.trick.kickflip,SCORE.trick.heelflip,SCORE.trick.varial]));
  assert.ok(combo>SCORE.trick.kickflip+SCORE.trick.heelflip+SCORE.trick.varial);
  assert.ok(landed([[-80,0]],'Perfect')>landed([[-80,0]],'Clean'));assert.ok(landed([[-80,0]],'Clean')>kickflip);
  assert.equal(airPoints(Array(40).fill(100)),100*40*SCORE.comboMax);
});

test('a trick landed while the board is still turning also counts, once',()=>{
  const run=createRun();
  run.tick({grounded:false});run.tricks.tryFlick(-80,0,true);
  for(let i=0;i<Math.round(0.44/dt);i++)run.tick({grounded:false});
  assert.ok(run.tricks.state.active);
  run.tick();assert.equal(run.tricks.state.lastLanded,'Kickflip');
  for(let i=0;i<50;i++)run.tick();
  assert.equal(run.score.total,SCORE.trick.kickflip);
  run.tick({grounded:false});run.flick(80,0);run.tick();
  assert.equal(run.score.total,2*SCORE.trick.kickflip);
});

test('a bail scores nothing for that air and ends the scoring, keeping what was banked',()=>{
  const run=createRun();
  run.tick({grounded:false});run.flick(-80,0);run.tick();
  for(let i=0;i<120;i++)run.tick({},20);
  const before=run.score.total;
  near(before,SCORE.trick.kickflip+20*SCORE.distance);
  run.tick({grounded:false});run.flick(80,0,0.33);
  run.tricks.tryFlick(-80,0,true);for(let i=0;i<20;i++)run.tick({grounded:false});
  run.tick();
  assert.equal(run.tricks.state.message,'Bail!');assert.equal(run.score.ended,true);assert.equal(run.score.total,before);
  // The tumble and anything after it earn nothing until the next run.
  for(let i=0;i<120;i++)run.tick({crashed:true},20);
  run.tick({grounded:false});run.flick(-80,0);run.tick();
  assert.equal(run.score.total,before);
  run.score.reset();assert.equal(run.score.total,0);assert.equal(run.score.ended,false);
  run.tick({grounded:false});run.flick(-80,0);run.tick();
  assert.equal(run.score.total,SCORE.trick.kickflip);
});

test('a crash drops tricks that were not landed yet',()=>{
  const run=createRun();
  run.tick({grounded:false});run.flick(-80,0);
  run.tick({grounded:false,crashed:true});run.tick({crashed:true});
  assert.equal(run.score.total,0);assert.equal(run.score.ended,true);
});

test('distance contributes from where the run started and never runs backwards',()=>{
  const score=createScore(),tricks=createTrickSystem().state;
  const at=(distance:number)=>score.step(tricks,{distance,grounded:true,crashed:false});
  at(40);assert.equal(score.total,0);
  at(140.9);assert.equal(score.total,Math.floor(100.9*SCORE.distance));
  at(120);assert.equal(score.total,Math.floor(100.9*SCORE.distance));
  // The first sample after a restart may still carry the previous run's distance.
  score.reset();at(900);at(0);at(25);assert.equal(score.total,25*SCORE.distance);
  assert.equal(score.tricks,0);
});

test('flips, grabs, manuals and grinds bank when they end cleanly',()=>{
  let run=createRun();
  run.tick({grounded:false});
  for(let i=0;i<30;i++)run.tick({grounded:false,pitch:TURN*i/29});
  // The rider's rotation is already cleared on the touchdown tick.
  run.tick({pitch:0,landing:'Perfect'});
  assert.equal(run.score.total,Math.round(SCORE.flip*SCORE.landing.Perfect));

  run=createRun();
  run.tick({grounded:false});
  for(let i=0;i<60;i++) {run.tricks.setGrab(1,0,true,true);run.tick({grounded:false});}
  assert.equal(run.score.total,0);
  run.tricks.setGrab(0,0,true,true);run.flick(-80,0);run.tick();
  assert.equal(run.score.total,airPoints([grabPoints(0.5),SCORE.trick.kickflip]));

  run=createRun();
  for(let i=0;i<120;i++) {run.tricks.setGround(0,1,true);run.tick({},10);}
  near(run.score.total,10);assert.equal(run.score.tricks,0);
  run.tricks.setGround(0,0,true);run.tick();
  near(run.score.tricks,10*SCORE.manual);near(run.score.total,10+10*SCORE.manual);
  for(let i=0;i<60;i++) {run.tricks.setGround(0,1,true);run.tick({},10);}
  run.tick({crashed:true});
  near(run.score.tricks,10*SCORE.manual);near(run.score.total,15+10*SCORE.manual);

  run=createRun();
  run.tick({grind:{active:true,meters:4}});run.tick({grind:{active:true,meters:10}});
  assert.equal(run.score.total,0);
  run.tick({grind:{active:false,meters:10}});
  assert.equal(run.score.total,10*SCORE.grindDefault);
  // A second rail starts counting from zero again, at its own rate.
  run.tick({grind:{active:true,meters:2,name:'Noseblunt'}});run.tick({grind:{active:true,meters:5,name:'Noseblunt'}});
  run.tick({grounded:false,grind:{active:false,meters:5,name:'Noseblunt'}});
  assert.equal(run.score.total,10*SCORE.grindDefault+5*SCORE.grind.noseblunt!);
});

test('grind names are matched loosely and unknown ones fall back',()=>{
  assert.equal(grindKey('50–50 GRIND'),'5050');assert.equal(grindKey('50-50'),'5050');assert.equal(grindKey('5-0'),'50');
  assert.equal(grindKey('Nosegrind'),'nose');assert.equal(grindKey('Tail Slide'),'tailslide');assert.equal(grindKey('Grind'),'grind');
  assert.equal(grindRate('Nosegrind'),SCORE.grind.nose);assert.equal(grindRate('Lipslide'),SCORE.grind.lipslide);
  assert.ok(grindRate('Nosegrind')>grindRate('50-50'));assert.ok(grindRate('Lipslide')>grindRate('Boardslide'));
  for(const name of [undefined,null,7,'','Darkslide','constructor','toString'])assert.equal(grindRate(name),SCORE.grindDefault);
});

test('high scores persist per mode, only improve, and tolerate blocked or invalid storage',()=>{
  const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key) ?? null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  assert.equal(loadHighScore('skate',storage),0);
  assert.equal(saveHighScore('skate',1200.9,storage),1200);assert.equal(loadHighScore('skate',storage),1200);
  assert.equal(loadHighScore('snowboard',storage),0);
  assert.equal(saveHighScore('snowboard',300,storage),300);assert.equal(loadHighScore('skate',storage),1200);
  assert.equal(saveHighScore('skate',900,storage),1200);assert.equal(values.get(highScoreKey('skate')),'1200');
  assert.equal(saveHighScore('skate',NaN,storage),1200);assert.equal(saveHighScore('skate',-5,storage),1200);
  for(const bad of ['','abc','-40','12.5','1e9','Infinity',' 7','99999999999999999999']) {
    values.set(highScoreKey('skate'),bad);assert.equal(loadHighScore('skate',storage),0,bad);
  }
  assert.equal(saveHighScore('skate',50,storage),50);assert.equal(values.get(highScoreKey('skate')),'50');
  const blocked={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}};
  assert.equal(loadHighScore('skate',blocked),0);
  // The caller still gets the score back, so the session keeps its best in memory.
  assert.equal(saveHighScore('skate',700,blocked),700);
});

test('points build while a trick is in progress, pay out as one event, and are shown as lost on a bail',()=>{
  const run=createRun();
  run.tick({grounded:false});assert.equal(run.score.pending,0);
  run.flick(-80,0);assert.equal(run.score.pending,SCORE.trick.kickflip);
  run.flick(80,0,0.33);
  const combo=airPoints([SCORE.trick.kickflip,SCORE.trick.heelflip*SCORE.spins[1]!]);
  assert.equal(run.score.pending,combo);assert.equal(run.score.total,0);assert.equal(run.score.event.id,0);
  // A flip in progress counts once it has gone round.
  run.tick({grounded:false,pitch:TURN});assert.equal(run.score.pending,airPoints([SCORE.trick.kickflip,SCORE.trick.heelflip*SCORE.spins[1]!,SCORE.flip]));
  run.tick({grounded:false});
  run.tick({landing:'Perfect'});
  const paid=airPoints([SCORE.trick.kickflip,SCORE.trick.heelflip*SCORE.spins[1]!],'Perfect');
  assert.deepEqual({...run.score.event},{id:1,points:paid,lost:false});
  assert.equal(run.score.pending,0);assert.equal(run.score.total,paid);
  run.tick();assert.equal(run.score.event.id,1,'one payout per landing');

  // Grinds count up and pay when they end.
  run.tick({grounded:false,grind:{active:true,meters:0,name:'50-50'}});
  run.tick({grounded:false,grind:{active:true,meters:10,name:'50-50'}});
  assert.equal(run.score.pending,10*SCORE.grind['5050']!);
  run.tick({grind:{active:false,meters:10,name:'50-50'}});
  assert.deepEqual({...run.score.event},{id:2,points:10*SCORE.grind['5050']!,lost:false});

  // A bail mid-trick reports what was riding on it and pays nothing.
  const total=run.score.total;
  run.tick({grounded:false});run.flick(-80,0);
  run.tricks.tryFlick(-80,0,true);for(let i=0;i<10;i++)run.tick({grounded:false});
  run.tick();
  assert.deepEqual({...run.score.event},{id:3,points:SCORE.trick.kickflip,lost:true});
  assert.equal(run.score.pending,0);assert.equal(run.score.total,total);
  run.score.reset();assert.equal(run.score.pending,0);
});
