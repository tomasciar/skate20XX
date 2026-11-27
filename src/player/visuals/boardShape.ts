import type {Group} from 'three';
export type BoardShape={root:Group;update(dt:number,speed:number,travelSide?:number):void;reset():void};
export function createBoardShape():BoardShape|undefined {return undefined;}
