import type { GrindState } from "../player/grind";
import type { TrickState } from "../player/tricks";
import type { AirRotationState } from "../player/airRotation";
import {MODE_TITLES} from '../mode.ts';
import type {RideMode} from '../mode.ts';

export function createHud() {
  const speedEl = document.getElementById("speed")!;
  const distanceEl = document.getElementById("distance")!;
  const trickEl = document.getElementById("trick")!;
  const overlay = document.getElementById("overlay")!;
  const airMode = document.getElementById("air-mode")!;

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function showOverlay() {
    overlay.classList.remove("hidden");
    overlay.querySelector("h2")!.textContent = "PAUSED";
    overlay.querySelector("#overlay-description")!.textContent = "Click or press Enter to keep rolling";
  }

  /** Airs per run that show the flip-mode hint. */
  const FLIP_HINTS=2;
  let flipHints=0,flipHintAir=false,wasEngaged=false;
  /** A new run may show the flip-mode hint again. */
  function newRun() { flipHints=0;flipHintAir=wasEngaged=false;airMode.hidden=true; }

  function update(speed: number, tricks: TrickState, distance = 0, grind?: GrindState, aerial?: AirRotationState) {
    // SI velocity to miles per hour.
    speedEl.textContent = String(Math.round(speed * 2.23694));
    distanceEl.textContent = String(Math.round(distance));
    // The flip-mode reminder is a hint, not a readout: it shows for the first airs of a run that use flip mode.
    const engaged=!!aerial?.engaged;
    if(engaged && !wasEngaged) flipHintAir=flipHints++<FLIP_HINTS;
    if(!engaged) flipHintAir=false;
    wasEngaged=engaged;
    airMode.hidden=!flipHintAir;
    if(flipHintAir) airMode.textContent=aerial!.active
      ? 'FLIP MODE · W/S flip · A/D roll · Space to steer'
      : 'STEERING · A/D turn · Space to flip';

    if (grind?.active) {
      trickEl.textContent = `${/\d$/.test(grind.name) ? `${grind.name} GRIND` : grind.name.toUpperCase()} · ${Math.floor(grind.meters)} m`;
      trickEl.classList.add("show"); trickEl.classList.remove("bail");
      const balance = document.getElementById("grind-balance")!;
      balance.hidden = false;
      balance.setAttribute("aria-valuenow", String(Math.round(grind.balance * 100)));
      (balance.firstElementChild as HTMLElement).style.left = `${50 + grind.balance * 45}%`;
    } else {
      document.getElementById("grind-balance")!.hidden = true;
    }
    if (grind?.active) return;
    if (tricks.ground) {
      trickEl.textContent=tricks.ground.manual
        ? `${tricks.ground.name} · ${Math.floor(tricks.groundMeters)} m` : tricks.ground.name;
      trickEl.classList.add('show');trickEl.classList.remove('bail');return;
    }
    if (tricks.message) {
      trickEl.textContent = tricks.message;
      trickEl.classList.add("show");
      trickEl.classList.toggle("bail", tricks.bail || tricks.message === "Bail!");
    } else {
      trickEl.classList.remove("show");
    }
  }

  const scoreEl=document.getElementById('score'),bestEl=document.getElementById('best');
  const bestRow=document.getElementById('best-row'),bestLabel=document.getElementById('best-label'),overlayBest=document.getElementById('overlay-best');
  /** `record` marks a run that has passed the best it started against. */
  function setScore(score:number,best:number,record=false) {
    if(scoreEl)scoreEl.textContent=score.toLocaleString('en-US');
    if(bestEl)bestEl.textContent=best.toLocaleString('en-US');
    if(bestLabel)bestLabel.textContent=record?'New best':'Best';
    bestRow?.classList.toggle('record',record);
    if(overlayBest) {overlayBest.hidden=best<=0;overlayBest.textContent=`Best score · ${best.toLocaleString('en-US')}`;}
  }

  const pointsEl=document.getElementById('trick-points');
  let pointsEvent=0,pointsUntil=0;
  /** Points building under the trick name, then the payout (or the loss) held for a moment. */
  function setPoints(pending:number,event:{id:number;points:number;lost:boolean},now=performance.now()) {
    if(!pointsEl)return;
    if(event.id!==pointsEvent) {
      pointsEvent=event.id;pointsUntil=now+1300;
      pointsEl.textContent=`+${event.points.toLocaleString('en-US')}`;
      pointsEl.className=`trick-points show ${event.lost?'lost':'banked'}`;
    } else if(now>=pointsUntil) {
      if(pending>0)pointsEl.textContent=`+${pending.toLocaleString('en-US')}`;
      pointsEl.className=pending>0?'trick-points show':'trick-points';
    }
  }
  /** Forget a payout from the previous run. */
  function clearPoints(event:{id:number}) { pointsEvent=event.id;pointsUntil=0;if(pointsEl)pointsEl.className='trick-points'; }

  function setMode(mode:RideMode) {
    const title=MODE_TITLES[mode];document.title=title;
    document.querySelector('#hud h1')!.textContent=title;
    const heading=overlay.querySelector('h2')!;
    if(heading.textContent!=='PAUSED')heading.textContent=title;
  }
  return { update, newRun, hideOverlay, showOverlay, setMode, setScore, setPoints, clearPoints, overlay };
}
