import {isRideMode,saveRideMode} from '../mode.ts';
import type {RideMode} from '../mode.ts';

export function createModeControls(initial:RideMode,onChange:(mode:RideMode)=>void) {
  const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('#mode-controls [data-mode]'));
  let mode=initial;
  function paint() {
    document.documentElement.dataset.mode=mode;
    for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
  }
  function select(event:Event) {
    const button=event.currentTarget as HTMLButtonElement,next=button.dataset.mode;
    if(isRideMode(next) && next!==mode) {mode=next;paint();saveRideMode(mode);onChange(mode);}
    // Give the game its keyboard controls back after a mouse or keyboard selection.
    button.blur();
  }
  for(const button of buttons)button.addEventListener('click',select);
  paint();
  return {get mode(){return mode;},dispose(){for(const button of buttons)button.removeEventListener('click',select);}};
}
