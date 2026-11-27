import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWeaponControls,loadWeaponVisibility,saveWeaponVisibility,WEAPON_STORAGE_KEY} from '../src/ui/weapons.ts';

test('held weapons default to visible and the preference tolerates disabled storage',()=>{
  const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  assert.equal(loadWeaponVisibility(storage),true);saveWeaponVisibility(false,storage);assert.equal(loadWeaponVisibility(storage),false);
  saveWeaponVisibility(true,storage);assert.equal(loadWeaponVisibility(storage),true);
  const blocked={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
  assert.equal(loadWeaponVisibility(blocked),true);assert.doesNotThrow(()=>saveWeaponVisibility(false,blocked));
});

test('weapon toggle restores the saved state, updates accessibility, persists and returns keyboard focus',()=>{
  class Button extends EventTarget {
    attributes=new Map<string,string>();blurs=0;
    setAttribute(name:string,value:string){this.attributes.set(name,value);}
    blur(){this.blurs++;}
  }
  const button=new Button(),values=new Map([[WEAPON_STORAGE_KEY,'off']]),changes:boolean[]=[];
  const oldDocument=globalThis.document,oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.assign(globalThis,{document:{getElementById:()=>button}});
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)}});
  try {
    const control=createWeaponControls(shown=>changes.push(shown));
    assert.deepEqual(changes,[false]);assert.equal(button.attributes.get('aria-pressed'),'false');
    button.dispatchEvent(new Event('click'));assert.equal(control.shown,true);assert.equal(button.blurs,1);
    assert.equal(values.get(WEAPON_STORAGE_KEY),'on');assert.equal(button.attributes.get('aria-pressed'),'true');
    control.dispose();button.dispatchEvent(new Event('click'));assert.deepEqual(changes,[false,true]);
  } finally {
    if(oldDocument)globalThis.document=oldDocument;else delete (globalThis as Record<string,unknown>).document;
    if(oldStorage)Object.defineProperty(globalThis,'localStorage',oldStorage);else delete (globalThis as Record<string,unknown>).localStorage;
  }
});
