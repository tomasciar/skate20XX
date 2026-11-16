import {BOARD_STYLES,boardStyle,isBoardStyleId,saveBoardStyle} from '../boards.ts';
import type {BoardStyleId} from '../boards.ts';

export function createBoardControls(initial:BoardStyleId,onChange:(style:BoardStyleId)=>void) {
  const select=document.getElementById('board-select') as HTMLSelectElement;
  const swatch=document.getElementById('board-swatch')!;
  select.replaceChildren(...BOARD_STYLES.map(style=>{
    const option=document.createElement('option');option.value=style.id;option.textContent=style.name;return option;
  }));
  let style=initial;
  function display() {
    const palette=boardStyle(style);select.value=style;select.title=palette.description;
    const hex=(color:number)=>`#${color.toString(16).padStart(6,'0')}`;
    swatch.style.background=`linear-gradient(155deg, ${hex(palette.deck)} 0 38%, ${hex(palette.accent)} 38% 63%, ${hex(palette.ink)} 63%)`;
  }
  function change() {
    const next=select.value;
    if(isBoardStyleId(next)&&next!==style){style=next;saveBoardStyle(style);onChange(style);}
    display();select.blur();
  }
  select.addEventListener('change',change);display();
  return {get style(){return style;},dispose(){select.removeEventListener('change',change);}};
}
