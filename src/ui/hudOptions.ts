import { readGameValue } from '../storage.ts';
/** HUD elements a player can hide. Each is shown unless it was switched off. */
export const HUD_OPTIONS=['controls','tricks'] as const;
export type HudOption=typeof HUD_OPTIONS[number];
const storageKey=(option:HudOption)=>`skate20XX.hud.${option}`;

export function loadHudOption(option:HudOption,storage?:Pick<Storage,'getItem'>) {
  try {return readGameValue(storage ?? globalThis.localStorage, storageKey(option))!=='off';}
  catch {return true;}
}
export function saveHudOption(option:HudOption,shown:boolean,storage?:Pick<Storage,'setItem'>) {
  try {(storage ?? globalThis.localStorage).setItem(storageKey(option),shown?'on':'off');}catch { /* Private browsing can block storage. */ }
}

/** Toggle buttons under the board switch; the stylesheet hides elements from the root data attributes. */
export function createHudOptions() {
  const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('#hud-options [data-option]'));
  const shown=Object.fromEntries(HUD_OPTIONS.map(option=>[option,loadHudOption(option)])) as Record<HudOption,boolean>;
  const isOption=(value:unknown):value is HudOption=>HUD_OPTIONS.includes(value as HudOption);
  function paint() {
    for(const option of HUD_OPTIONS)document.documentElement.dataset[`hud${option[0]!.toUpperCase()}${option.slice(1)}`]=shown[option]?'on':'off';
    for(const button of buttons) {
      const option=button.dataset.option;
      if(isOption(option))button.setAttribute('aria-pressed',String(shown[option]));
    }
  }
  function toggle(event:Event) {
    const button=event.currentTarget as HTMLButtonElement,option=button.dataset.option;
    if(isOption(option)) {shown[option]=!shown[option];paint();saveHudOption(option,shown[option]);}
    // Give the game its keyboard controls back after a mouse or keyboard selection.
    button.blur();
  }
  for(const button of buttons)button.addEventListener('click',toggle);
  paint();
  return {shown,dispose(){for(const button of buttons)button.removeEventListener('click',toggle);}};
}
