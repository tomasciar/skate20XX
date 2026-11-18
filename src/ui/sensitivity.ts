import {SENSITIVITY,SENSITIVITY_CONTROLS,clampSensitivity} from '../player/movement/sensitivity.ts';
import type {SensitivityControl,SensitivitySettings} from '../player/movement/sensitivity.ts';

export const LEGACY_SENSITIVITY_STORAGE_KEY='skate5.turnSensitivity';
const storageKey=(control:SensitivityControl)=>`skate5.sensitivity.${control}`;

export function loadSensitivitySettings(storage?:Pick<Storage,'getItem'>):SensitivitySettings {
  const parse=(value:string|null,fallback:number)=>value===null || value.trim()==='' || !Number.isFinite(Number(value))
    ?fallback:clampSensitivity(Number(value));
  try {
    const source=storage??globalThis.localStorage;
    // Carry the previous shared preference into each control until it is adjusted independently.
    const legacy=parse(source.getItem(LEGACY_SENSITIVITY_STORAGE_KEY),SENSITIVITY.default);
    return Object.fromEntries(SENSITIVITY_CONTROLS.map(control=>[control,parse(source.getItem(storageKey(control)),legacy)])) as SensitivitySettings;
  } catch {return {carve:1,flip:1,turn:1};}
}
export function saveSensitivity(control:SensitivityControl,value:number,storage?:Pick<Storage,'setItem'>) {
  try {(storage??globalThis.localStorage).setItem(storageKey(control),String(clampSensitivity(value)));}
  catch { /* Storage may be disabled. */ }
}

export function createSensitivityControls(onChange:(values:SensitivitySettings)=>void) {
  const values=loadSensitivitySettings();
  const controls=SENSITIVITY_CONTROLS.map(control=>{
    const slider=document.getElementById(`${control}-sensitivity`) as HTMLInputElement;
    const output=document.getElementById(`${control}-sensitivity-value`)!;
    slider.min=String(SENSITIVITY.min);slider.max=String(SENSITIVITY.max);slider.step=String(SENSITIVITY.step);
    const input=()=>{values[control]=clampSensitivity(Number(slider.value));saveSensitivity(control,values[control]);paint();};
    const release=()=>slider.blur();
    slider.addEventListener('input',input);slider.addEventListener('pointerup',release);
    return {control,slider,output,input,release};
  });
  function paint() {
    for(const {control,slider,output} of controls) {
      const value=values[control];slider.value=String(value);output.textContent=`${value.toFixed(2)}×`;
      slider.setAttribute('aria-valuetext',`${value.toFixed(2)} times`);
    }
    onChange({...values});
  }
  paint();
  return {get values(){return {...values};},dispose(){for(const {slider,input,release} of controls){slider.removeEventListener('input',input);slider.removeEventListener('pointerup',release);}}};
}
