import { readGameValue } from '../storage.ts';
export const WEAPON_STORAGE_KEY='skate20XX.heldWeapons';
type StorageLike=Pick<Storage,'getItem'|'setItem'>;

export function loadWeaponVisibility(storage?:Pick<StorageLike,'getItem'>) {
  try {return readGameValue(storage ?? globalThis.localStorage, WEAPON_STORAGE_KEY)!=='off';}
  catch {return true;}
}
export function saveWeaponVisibility(shown:boolean,storage?:Pick<StorageLike,'setItem'>) {
  try {(storage??globalThis.localStorage).setItem(WEAPON_STORAGE_KEY,shown?'on':'off');}
  catch { /* Storage may be disabled. */ }
}

export function createWeaponControls(onChange:(shown:boolean)=>void) {
  const button=document.getElementById('weapon-toggle') as HTMLButtonElement;
  let shown=loadWeaponVisibility();
  function paint(){button.setAttribute('aria-pressed',String(shown));onChange(shown);}
  function toggle(){shown=!shown;saveWeaponVisibility(shown);paint();button.blur();}
  button.addEventListener('click',toggle);paint();
  return {get shown(){return shown;},dispose(){button.removeEventListener('click',toggle);}};
}
