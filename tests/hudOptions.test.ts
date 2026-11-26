import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHudOptions,loadHudOption,saveHudOption} from '../src/ui/hudOptions.ts';

test('HUD options default to shown, persist, and tolerate blocked storage',()=>{
  const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key) ?? null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  assert.equal(loadHudOption('controls',storage),true);assert.equal(loadHudOption('tricks',storage),true);
  saveHudOption('tricks',false,storage);assert.equal(loadHudOption('tricks',storage),false);assert.equal(loadHudOption('controls',storage),true);
  saveHudOption('tricks',true,storage);assert.equal(loadHudOption('tricks',storage),true);
  const blocked={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}};
  assert.equal(loadHudOption('controls',blocked),true);assert.doesNotThrow(()=>saveHudOption('controls',false,blocked));
});

test('HUD toggle buttons flip independently, drive the root attributes, save, and release keyboard focus',()=>{
  class Button extends EventTarget {
    dataset:{option:string};attributes=new Map<string,string>();blurs=0;
    constructor(option:string){super();this.dataset={option};}
    setAttribute(name:string,value:string){this.attributes.set(name,value);}
    blur(){this.blurs++;}
  }
  const buttons=[new Button('controls'),new Button('tricks')],values=new Map<string,string>([['skate20XX.hud.controls','off']]);
  const root={dataset:{} as Record<string,string>};
  const oldDocument=globalThis.document,oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.assign(globalThis,{document:{querySelectorAll:()=>buttons,documentElement:root}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)}});
  try {
    const options=createHudOptions();
    // A saved preference is applied on load; everything else starts shown.
    assert.deepEqual(root.dataset,{hudControls:'off',hudTricks:'on'});
    assert.equal(buttons[0]!.attributes.get('aria-pressed'),'false');assert.equal(buttons[1]!.attributes.get('aria-pressed'),'true');
    buttons[1]!.dispatchEvent(new Event('click'));
    assert.deepEqual(root.dataset,{hudControls:'off',hudTricks:'off'});assert.equal(loadHudOption('tricks'),false);
    assert.equal(buttons[1]!.attributes.get('aria-pressed'),'false');assert.equal(buttons[1]!.blurs,1);
    buttons[0]!.dispatchEvent(new Event('click'));buttons[1]!.dispatchEvent(new Event('click'));
    assert.deepEqual(root.dataset,{hudControls:'on',hudTricks:'on'});assert.deepEqual(options.shown,{controls:true,tricks:true});
    options.dispose();buttons[0]!.dispatchEvent(new Event('click'));assert.equal(root.dataset.hudControls,'on');
  } finally {
    if(oldDocument)globalThis.document=oldDocument;else delete (globalThis as Record<string,unknown>).document;
    if(oldStorage)Object.defineProperty(globalThis,'localStorage',oldStorage);else delete (globalThis as Record<string,unknown>).localStorage;
  }
});
