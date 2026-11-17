import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTrickSystem } from '../src/player/tricks/tricks.ts';

const dt=1/120;
/** Flick, hold the direction for `hold` seconds, then stay airborne until the board is caught. */
function flick(tricks:ReturnType<typeof createTrickSystem>,dx:number,dy:number,hold:number) {
  tricks.tryFlick(dx,dy,true);
  let time=0,lastZ=0;
  for(let i=0;i<600 && tricks.state.active;i++) {
    const down=i*dt<hold;
    tricks.holdFlick(down?dx:0,down?dy:0);tricks.update(dt,false,1,30);time+=dt;
    if(tricks.state.active) {
      // The board only ever turns one way, with no jump between rotations.
      const z=tricks.state.boardSpin.z;
      assert.ok(Math.abs(z)>=Math.abs(lastZ)-1e-9);assert.ok(Math.abs(z-lastZ)<0.3);lastZ=z;
    }
  }
  assert.equal(tricks.state.active,null);
  return time;
}

test('an unheld flick is still a single trick with the original timing',()=>{
  const tricks=createTrickSystem();
  const time=flick(tricks,-80,0,0);
  assert.ok(Math.abs(time-0.45)<dt*1.5);assert.deepEqual(tricks.state.combo,['Kickflip']);
  assert.deepEqual(tricks.state.boardSpin,{x:0,y:0,z:0});
});

test('holding the trick input adds rotations up to a quadruple',()=>{
  for(const [hold,name] of [[0.1,'Kickflip'],[0.33,'Double Kickflip'],[0.56,'Triple Kickflip'],[0.8,'Quadruple Kickflip'],[5,'Quadruple Kickflip']] as const) {
    const tricks=createTrickSystem();
    flick(tricks,-80,0,hold);assert.deepEqual(tricks.state.combo,[name]);
    tricks.update(dt,true,1,30);
    assert.equal(tricks.state.lastLanded,name);assert.equal(tricks.state.bail,false);
  }
  const tricks=createTrickSystem();
  flick(tricks,0,-80,0.33);flick(tricks,80,-80,0.33);
  assert.deepEqual(tricks.state.combo,['360 Shove-It','Double Hardflip']);
});

test('a hold must start with the trick and match its direction',()=>{
  const tricks=createTrickSystem();
  tricks.tryFlick(-80,0,true);tricks.update(dt,false,1,30);
  for(let i=0;i<200;i++) { tricks.holdFlick(-1,0);tricks.update(dt,false,1,30); }
  assert.deepEqual(tricks.state.combo,['Kickflip']);
  tricks.tryFlick(-80,0,true);
  for(let i=0;i<200;i++) { tricks.holdFlick(1,0);tricks.update(dt,false,1,30); }
  assert.deepEqual(tricks.state.combo,['Kickflip','Kickflip']);
});

test('any number of tricks chain in one air and land as a combo',()=>{
  const tricks=createTrickSystem();
  flick(tricks,-80,0,0);const started=tricks.state.started;
  flick(tricks,80,0,0.33);flick(tricks,0,-80,0);flick(tricks,-80,-80,0);
  assert.equal(tricks.state.started,started+3);
  // Grabs are available again between tricks.
  tricks.setGrab(1,0,true,true);assert.equal(tricks.state.grab?.id,'pushout');tricks.setGrab(0,0,true,true);
  tricks.update(dt,true,1,30);
  assert.equal(tricks.state.lastLanded,'Kickflip + Double Heelflip + Pop Shove-It + Varial Flip');
  assert.equal(tricks.state.message,tricks.state.lastLanded);
  assert.deepEqual(tricks.state.combo,[]);assert.equal(tricks.state.bail,false);
});

test('a press during a trick is buffered; a near-simultaneous one completes the diagonal',()=>{
  const tricks=createTrickSystem();
  tricks.tryFlick(-80,0,true);
  for(let i=0;i<30;i++)tricks.update(dt,false,1,30);
  tricks.tryFlick(80,0,true);assert.equal(tricks.state.active?.id,'kickflip');
  for(let i=0;i<30;i++)tricks.update(dt,false,1,30);
  assert.equal(tricks.state.active?.id,'heelflip');assert.deepEqual(tricks.state.combo,['Kickflip']);

  const diagonal=createTrickSystem();
  diagonal.tryFlick(-80,0,true);diagonal.update(dt,false,1,30);diagonal.update(dt,false,1,30);
  diagonal.tryFlick(-80,-80,true);assert.equal(diagonal.state.active?.id,'varial');
  for(let i=0;i<120;i++)diagonal.update(dt,false,1,30);
  assert.deepEqual(diagonal.state.combo,['Varial Flip']);
});

test('landing mid-rotation bails, even after completed tricks, and clears the combo',()=>{
  const tricks=createTrickSystem();
  flick(tricks,-80,0,0);
  tricks.tryFlick(-80,0,true);
  for(let i=0;i<40;i++) { tricks.holdFlick(-1,0);tricks.update(dt,false,1,30); }
  tricks.update(dt,true,1,30);
  assert.equal(tricks.state.bail,true);assert.equal(tricks.state.message,'Bail!');
  assert.equal(tricks.state.active,null);assert.deepEqual(tricks.state.combo,[]);
  tricks.clearBail();

  // Touching down just as a held rotation comes level counts the completed spins.
  tricks.tryFlick(-80,0,true);
  for(let i=0;i<600 && tricks.state.boardSpin.z>-Math.PI*2*1.03;i++) { tricks.holdFlick(-1,0);tricks.update(dt,false,1,30); }
  tricks.holdFlick(-1,0);tricks.update(dt,true,1,30);
  assert.equal(tricks.state.bail,false);assert.equal(tricks.state.lastLanded,'Kickflip');
});
