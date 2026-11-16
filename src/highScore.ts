import type {RideMode} from './mode.ts';

/** Best run per ride mode. Stored only in this browser; there are no accounts or servers behind it. */
export const highScoreKey=(mode:RideMode)=>`skate5.highScore.${mode}`;
type ScoreStorage=Pick<Storage,'getItem'|'setItem'>;

export function loadHighScore(mode:RideMode,storage?:Pick<Storage,'getItem'>) {
  try {
    const value=(storage ?? globalThis.localStorage).getItem(highScoreKey(mode)),score=Number(value);
    // Anything but a plain whole number is treated as no score rather than trusted.
    return value!==null && /^\d+$/.test(value) && Number.isSafeInteger(score)?score:0;
  } catch {return 0;}
}
/** Stores `score` if it beats the saved one and returns the best of the two. */
export function saveHighScore(mode:RideMode,score:number,storage?:ScoreStorage) {
  const best=loadHighScore(mode,storage),next=Number.isFinite(score)?Math.floor(score):0;
  if(next<=best)return best;
  try {(storage ?? globalThis.localStorage).setItem(highScoreKey(mode),String(next));}catch { /* Private browsing can block storage. */ }
  return next;
}
