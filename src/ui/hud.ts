import type { GrindState } from "../player/grind";
import type { TrickState } from "../player/tricks";

export function createHud() {
  const speedEl = document.getElementById("speed")!;
  const distanceEl = document.getElementById("distance")!;
  const trickEl = document.getElementById("trick")!;
  const overlay = document.getElementById("overlay")!;

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  function showOverlay() {
    overlay.classList.remove("hidden");
    overlay.querySelector("h2")!.textContent = "PAUSED";
    overlay.querySelector("p")!.textContent = "Click or press Enter to keep rolling";
  }

  function update(speed: number, tricks: TrickState, distance = 0, grind?: GrindState) {
    // SI velocity to miles per hour.
    speedEl.textContent = String(Math.round(speed * 2.23694));
    distanceEl.textContent = String(Math.round(distance));

    if (grind?.active) {
      trickEl.textContent = `50–50 GRIND · ${Math.floor(grind.meters)} m`;
      trickEl.classList.add("show"); trickEl.classList.remove("bail");
      const balance = document.getElementById("grind-balance")!;
      balance.hidden = false;
      balance.setAttribute("aria-valuenow", String(Math.round(grind.balance * 100)));
      (balance.firstElementChild as HTMLElement).style.left = `${50 + grind.balance * 45}%`;
    } else {
      document.getElementById("grind-balance")!.hidden = true;
    }
    if (grind?.active) return;
    if (tricks.message) {
      trickEl.textContent = tricks.message;
      trickEl.classList.add("show");
      trickEl.classList.toggle("bail", tricks.bail || tricks.message === "Bail!");
    } else {
      trickEl.classList.remove("show");
    }
  }

  return { update, hideOverlay, showOverlay, overlay };
}
