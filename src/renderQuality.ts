/** Bound GPU fill work on retina/4K displays without changing the CSS or visible distance. */
export function basePixelRatio(width: number, height: number, deviceRatio: number) {
  return Math.min(deviceRatio, 1.5, Math.sqrt(2_000_000 / Math.max(1, width * height)));
}
export function createRenderQuality() {
  let scale = 1, elapsed = 0, frames = 0, goodSeconds = 0;
  function reset() { elapsed = frames = goodSeconds = 0; }
  function update(dt: number) {
    if (dt <= 0 || dt > 0.1) return false;
    elapsed += dt; frames++;
    if (elapsed < 1) return false;
    const mean = elapsed / frames, previous = scale;
    if (mean > 0.022) { scale = Math.max(0.7, scale - 0.1); goodSeconds = 0; }
    else if (mean < 0.0175) { if (++goodSeconds >= 4) { scale = Math.min(1, scale + 0.05); goodSeconds = 0; } }
    else goodSeconds = 0;
    elapsed = frames = 0;
    return Math.abs(scale - previous) > 0.001;
  }
  return { update, reset, get scale() { return scale; } };
}
