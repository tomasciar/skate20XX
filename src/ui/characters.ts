import {CHARACTERS,isCharacterId,saveCharacter} from '../characters.ts';
import type {CharacterId} from '../characters.ts';

export function createCharacterControls(initial:CharacterId,onChange:(character:CharacterId)=>void) {
  const select=document.getElementById('rider-select') as HTMLSelectElement;
  select.replaceChildren(...CHARACTERS.map(character=>{
    const option=document.createElement('option');option.value=character.id;option.textContent=character.name;return option;
  }));
  let character=initial;select.value=character;
  function change() {
    const next=select.value;
    if(isCharacterId(next) && next!==character){character=next;saveCharacter(character);onChange(character);}
    select.value=character;select.blur();
  }
  select.addEventListener('change',change);
  return {get character(){return character;},dispose(){select.removeEventListener('change',change);}};
}
