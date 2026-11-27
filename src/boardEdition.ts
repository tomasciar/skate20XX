import type {BoardBrush} from './boards.ts';

type Colors={deck:number;accent:number;ink:number};
export const editionBoards=[] as const;
export function boardShapeId(_id:string):string {return 'hardware';}
export function paintEditionBoard(_id:string,_colors:Colors,_brush:BoardBrush) {}
