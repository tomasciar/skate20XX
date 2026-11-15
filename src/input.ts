export type InputState = {
  push: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  crouch: boolean;
  crouchPressed: boolean;
  crouchReleased: boolean;
  reset: boolean;
  flickDX: number;
  flickDY: number;
  flickReady: boolean;
};

export function createInput(): {
  state: InputState;
  beginFrame: () => void;
  clear: () => void;
  consume: () => void;
  dispose: () => void;
} {
  const state: InputState = {
    push: false,
    brake: false,
    left: false,
    right: false,
    crouch: false,
    crouchPressed: false,
    crouchReleased: false,
    reset: false,
    flickDX: 0,
    flickDY: 0,
    flickReady: false,
  };

  const arrows = { up: false, down: false, left: false, right: false };
  let crouchWasDown = false;
  let pendingFlick: { x: number; y: number } | null = null;

  const onKeyDown = (e: KeyboardEvent) => {
    if (typeof HTMLElement !== "undefined" && e.target instanceof HTMLElement && e.target.closest("button, input, select, textarea")) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
      e.preventDefault();
    }
    if (e.repeat) return;
    switch (e.code) {
      case "KeyW":
        state.push = true;
        break;
      case "KeyS":
        state.brake = true;
        break;
      case "KeyA":
        state.left = true;
        break;
      case "KeyD":
        state.right = true;
        break;
      case "Space":
        state.crouchPressed = true;
        state.crouch = true;
        break;
      case "KeyR":
        state.reset = true;
        break;
      case "ArrowUp":
        arrows.up = true;
        queueTrick();
        break;
      case "ArrowDown":
        arrows.down = true;
        queueTrick();
        break;
      case "ArrowLeft":
        arrows.left = true;
        queueTrick();
        break;
      case "ArrowRight":
        arrows.right = true;
        queueTrick();
        break;
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    switch (e.code) {
      case "KeyW":
        state.push = false;
        break;
      case "KeyS":
        state.brake = false;
        break;
      case "KeyA":
        state.left = false;
        break;
      case "KeyD":
        state.right = false;
        break;
      case "Space":
        state.crouchReleased = true;
        state.crouch = false;
        break;
      case "ArrowUp":
        arrows.up = false;
        break;
      case "ArrowDown":
        arrows.down = false;
        break;
      case "ArrowLeft":
        arrows.left = false;
        break;
      case "ArrowRight":
        arrows.right = false;
        break;
    }
  };

  /** Arrow keys are the trick stick. Held pairs count as diagonals. */
  function queueTrick() {
    const x = (arrows.right ? 1 : 0) - (arrows.left ? 1 : 0);
    const y = (arrows.down ? 1 : 0) - (arrows.up ? 1 : 0);
    if (x === 0 && y === 0) return;
    pendingFlick = { x: x * 80, y: y * 80 };
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  function beginFrame() {
    state.crouchPressed ||= state.crouch && !crouchWasDown;
    state.crouchReleased ||= !state.crouch && crouchWasDown;
    crouchWasDown = state.crouch;

    if (pendingFlick) {
      state.flickDX = pendingFlick.x;
      state.flickDY = pendingFlick.y;
      state.flickReady = true;
      pendingFlick = null;
    }
  }

  function consume() {
    state.crouchPressed = state.crouchReleased = state.flickReady = state.reset = false;
    state.flickDX = state.flickDY = 0;
  }

  function clear() {
    consume();
    state.push = state.brake = state.left = state.right = state.crouch = false;
    arrows.up = arrows.down = arrows.left = arrows.right = false;
    crouchWasDown = false;
    pendingFlick = null;
  }

  window.addEventListener("blur", clear);

  function dispose() {
    window.removeEventListener("blur", clear);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  }

  return { state, beginFrame, consume, clear, dispose };
}
