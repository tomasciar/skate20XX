import {CHUNK_LENGTH,districtAt} from '../planning/generation.ts';
import type {District} from '../environments/catalog.ts';

const smooth=(value:number,a:number,b:number)=>{const t=Math.max(0,Math.min(1,(value-a)/(b-a)));return t*t*(3-2*t);};
function relief(district:District,height:number,x:number,along:number) {
  const d=Math.abs(x);
  if(district==='canyon')return height+smooth(d,85,175)*(17+10*Math.sin(along*.007+Math.sign(x))**2);
  if(district==='alpine')return height+smooth(d,100,230)*(20+14*Math.sin(along*.005+Math.sign(x)*2)**2);
  if(district==='harbor')return height+(-10-height)*smooth(d,150,240)*(x>0?1:.45);
  if(district==='gardens')return height*(1-.45*smooth(d,90,200));
  return height;
}
/** Biome silhouettes blend over the same longitudinal rows as terrain, away from the riding belt. */
export function biomeTerrainHeight(height:number,x:number,along:number) {
  const index=Math.floor(along/CHUNK_LENGTH),here=districtAt(index),previous=districtAt(here.start-1).district;
  const fade=smooth(along,here.start*CHUNK_LENGTH,here.start*CHUNK_LENGTH+50);
  return relief(previous,height,x,along)*(1-fade)+relief(here.district,height,x,along)*fade;
}
