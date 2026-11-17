import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRideContact} from '../src/player/movement/rideContact.ts';

const dt=1/120;
test('contact chatter and extended shallow skims retain riding without fake touchdowns',()=>{
  const contact=createRideContact();
  for(let i=0;i<120;i++) {
    contact.update(dt,i%5===0,true,12);
    assert.equal(contact.airborne,false);assert.equal(contact.landings,0);
  }
  for(let i=0;i<60;i++)contact.update(dt,false,true,0);
  assert.equal(contact.airborne,false);
  assert.equal(contact.update(dt,true,true,15),false);
});

test('short missing probes are forgiven, while real departures and explicit jumps enable flight',()=>{
  const contact=createRideContact();
  for(let i=0;i<5;i++)contact.update(dt,false,false,0);
  assert.equal(contact.airborne,false);
  contact.update(dt,true,true,0);
  for(let i=0;i<15;i++)contact.update(dt,false,false,0);
  assert.equal(contact.airborne,true);
  contact.reset();contact.takeoff();assert.equal(contact.airborne,true);
  contact.reset();contact.update(dt,false,false,0,true);
  assert.equal(contact.airborne,true,'a clearly separated rider should not wait for contact grace');
  assert.equal(contact.update(dt,true,true,25),true,'a fast, clearly separated drop is a real impact even with short airtime');
});

test('one sustained flight produces one actual surface-impact event, and soft settles are silent',()=>{
  const contact=createRideContact();contact.takeoff();
  for(let i=0;i<60;i++)contact.update(dt,false,false,0);
  assert.equal(contact.update(dt,true,true,8),true);
  assert.equal(contact.landings,1);assert.equal(contact.impact,8);
  for(let i=0;i<20;i++)assert.equal(contact.update(dt,true,true,8),false);
  contact.takeoff();
  for(let i=0;i<30;i++)contact.update(dt,false,false,0);
  assert.equal(contact.update(dt,true,true,2),false);assert.equal(contact.landings,1);
});
