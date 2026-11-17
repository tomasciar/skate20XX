import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coastSpeed, dragSpeed, SPEED, MPH_PER_MPS } from '../src/player/movement/speed.ts';

function descend(degrees: number, tuck: number, seconds=90, initial=0, dt=1/120) {
  const slope=degrees*Math.PI/180,gravity=18*Math.sin(slope);
  let speed=initial;
  for(let time=0;time<seconds-dt/2;time+=dt) speed=coastSpeed(Math.max(0,speed+gravity*dt),dt,tuck,Math.cos(slope));
  return speed;
}

test('slope and stance set the natural speed balance instead of a shared cap',()=>{
  const gentle=descend(7,0),hill=descend(14,0),steep=descend(25,0),tucked=descend(14,1);
  assert.ok(hill>gentle+10);
  assert.ok(steep>hill+15);
  assert.ok(tucked>hill+15);
  assert.ok(tucked*MPH_PER_MPS>199,'higher speeds must remain reachable');
  const expected=Math.sqrt((18*Math.sin(14*Math.PI/180)-SPEED.rollingResistance*Math.cos(14*Math.PI/180))/SPEED.dragUpright);
  assert.ok(Math.abs(descend(14,0,240)-expected)<0.1,'drag should balance downhill gravity');
});

test('flats and gentle climbs bleed speed while a tuck preserves more momentum',()=>{
  const flat=descend(0,0,10,70),uphill=descend(-1.5,0,10,70),tucked=descend(0,1,10,70);
  assert.ok(flat<70 && uphill<flat && tucked>flat && tucked<70);
  assert.equal(coastSpeed(0,1),0);
  assert.equal(descend(0,0,10),0,'a flat road must not accelerate by itself');
});

test('air drag slows extreme speeds progressively without truncating them at a fixed number',()=>{
  const fast=300/MPH_PER_MPS,after=dragSpeed(fast,1/120);
  assert.ok(after<fast && after>fast-0.1);
  assert.ok(after*MPH_PER_MPS>299);
  const slowLoss=20-dragSpeed(20,1/120),fastLoss=80-dragSpeed(80,1/120);
  assert.ok(fastLoss>slowLoss*10,'higher speeds should cost progressively more energy');
  for(const speed of [0,1,20,90,120,1000000]) for(const dt of [1/240,1/30,0.5]) {
    const result=dragSpeed(speed,dt);
    assert.ok(Number.isFinite(result) && result>=0 && result<=speed);
  }
});

test('the drag calculation is stable across frame rates',()=>{
  const whole=dragSpeed(120,1),half=dragSpeed(dragSpeed(120,0.5),0.5);
  assert.ok(Math.abs(whole-half)<1e-10);
  assert.ok(Math.abs(descend(14,0,60,0,1/60)-descend(14,0,60,0,1/120))<0.1);
});
