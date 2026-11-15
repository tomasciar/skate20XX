import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadRideMode,saveRideMode,MODE_STORAGE_KEY} from '../src/mode.ts';
import {createModeControls} from '../src/ui/modes.ts';

test('mode preferences persist, validate old values, and tolerate blocked storage',()=>{
  const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key) ?? null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  assert.equal(loadRideMode(storage),'skate');saveRideMode('snowboard',storage);assert.equal(loadRideMode(storage),'snowboard');
  values.set(MODE_STORAGE_KEY,'invalid');assert.equal(loadRideMode(storage),'skate');
  const blocked={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}};
  assert.equal(loadRideMode(blocked),'skate');assert.doesNotThrow(()=>saveRideMode('snowboard',blocked));
});

test('mode buttons update selection, theme and saved preference once without capturing game keyboard focus',()=>{
  class Button extends EventTarget {
    dataset:{mode:string};attributes=new Map<string,string>();blurs=0;
    constructor(mode:string){super();this.dataset={mode};}
    setAttribute(name:string,value:string){this.attributes.set(name,value);}
    blur(){this.blurs++;}
  }
  const buttons=[new Button('skate'),new Button('snowboard')],changes:string[]=[],values=new Map<string,string>();
  const oldDocument=globalThis.document,oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.assign(globalThis,{document:{querySelectorAll:()=>buttons,documentElement:{dataset:{}}}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)}});
  try {
    const controls=createModeControls('skate',mode=>changes.push(mode));
    assert.equal(buttons[0]!.attributes.get('aria-pressed'),'true');
    buttons[1]!.dispatchEvent(new Event('click'));
    assert.deepEqual(changes,['snowboard']);assert.equal(controls.mode,'snowboard');
    assert.equal(document.documentElement.dataset.mode,'snowboard');assert.equal(loadRideMode(),'snowboard');
    assert.equal(buttons[0]!.attributes.get('aria-pressed'),'false');assert.equal(buttons[1]!.attributes.get('aria-pressed'),'true');
    assert.equal(buttons[1]!.blurs,1);
    buttons[1]!.dispatchEvent(new Event('click'));assert.equal(changes.length,1);
    buttons[0]!.dispatchEvent(new Event('click'));assert.deepEqual(changes,['snowboard','skate']);
    controls.dispose();buttons[1]!.dispatchEvent(new Event('click'));assert.equal(changes.length,2);
  } finally {
    if(oldDocument)globalThis.document=oldDocument;else delete (globalThis as Record<string,unknown>).document;
    if(oldStorage)Object.defineProperty(globalThis,'localStorage',oldStorage);else delete (globalThis as Record<string,unknown>).localStorage;
  }
});
