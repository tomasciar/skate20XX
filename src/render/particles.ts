import * as THREE from 'three';

export type ParticleStyle = {
  color: number; size: number; life: number;
  /** Downward acceleration along world Y, m/s². */
  gravity?: number;
  /** Fraction of velocity lost per second. */
  drag?: number;
  /** Size multiplier reached at the end of life: dust billows, sparks shrink. */
  grow?: number;
  opacity?: number;
  /** Glowing particles add light instead of covering what is behind them. */
  glow?: boolean;
};
export const SPARK: ParticleStyle = { color: 0xffc35a, size: 0.07, life: 0.38, gravity: 14, drag: 0.6, grow: 0.3, opacity: 1, glow: true };
export const DUST: ParticleStyle = { color: 0xa89f8c, size: 0.2, life: 0.7, gravity: -0.4, drag: 2.4, grow: 3.2, opacity: 0.17 };

/** Fixed pool of camera-facing points for sparks and dust. Nothing is allocated after creation. */
export function createParticles(capacity = 384) {
  const position = new Float32Array(capacity * 3), velocity = new Float32Array(capacity * 3), color = new Float32Array(capacity * 3);
  const state = new Float32Array(capacity * 2), age = new Float32Array(capacity).fill(1), life = new Float32Array(capacity).fill(1);
  const styles: (ParticleStyle | null)[] = new Array(capacity).fill(null), tint = new THREE.Color();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  // x: size in metres (negative marks a glowing particle), y: opacity.
  geometry.setAttribute('state', new THREE.BufferAttribute(state, 2));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uScale: { value: 600 } },
    vertexShader: /* glsl */`
      attribute vec3 color; attribute vec2 state; uniform float uScale;
      varying vec3 vColor; varying float vOpacity, vGlow;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = abs(state.x) * uScale / max(0.1, -view.z);
        vColor = color; vOpacity = state.y; vGlow = step(state.x, 0.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor; varying float vOpacity, vGlow;
      void main() {
        float falloff = smoothstep(0.5, 0.12, length(gl_PointCoord - 0.5)) * vOpacity;
        if (falloff < 0.004) discard;
        // Premultiplied output: zero alpha makes a glowing particle purely additive.
        gl_FragColor = vec4(vColor * falloff, falloff * (1.0 - vGlow));
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'particles'; points.frustumCulled = false; points.renderOrder = 2;
  let cursor = 0, live = 0;

  function emit(style: ParticleStyle, at: THREE.Vector3, motion: THREE.Vector3, spread = 0, shade = 1) {
    const i = cursor; cursor = (cursor + 1) % capacity;
    position[i*3] = at.x; position[i*3+1] = at.y; position[i*3+2] = at.z;
    velocity[i*3] = motion.x + (Math.random() - 0.5) * spread;
    velocity[i*3+1] = motion.y + (Math.random() - 0.5) * spread;
    velocity[i*3+2] = motion.z + (Math.random() - 0.5) * spread;
    tint.setHex(style.color).multiplyScalar(shade * (0.85 + Math.random() * 0.3)).toArray(color, i*3);
    styles[i] = style; age[i] = 0; life[i] = style.life * (0.6 + Math.random() * 0.8);
    live = Math.max(live, 1);
  }
  function update(dt: number, viewportHeight: number, fovDegrees: number) {
    material.uniforms.uScale!.value = viewportHeight / (2 * Math.tan(fovDegrees * Math.PI / 360));
    if (!live) { points.visible = false; return; }
    live = 0;
    for (let i = 0; i < capacity; i++) {
      const style = styles[i];
      if (!style) continue;
      age[i]! += dt;
      const t = age[i]! / life[i]!;
      if (t >= 1) { styles[i] = null; state[i*2] = state[i*2+1] = 0; continue; }
      live++;
      const keep = Math.exp(-(style.drag ?? 0) * dt);
      velocity[i*3]! *= keep; velocity[i*3+2]! *= keep;
      velocity[i*3+1] = velocity[i*3+1]! * keep - (style.gravity ?? 0) * dt;
      position[i*3]! += velocity[i*3]! * dt; position[i*3+1]! += velocity[i*3+1]! * dt; position[i*3+2]! += velocity[i*3+2]! * dt;
      const size = style.size * (1 + ((style.grow ?? 1) - 1) * t);
      state[i*2] = style.glow ? -size : size;
      state[i*2+1] = (style.opacity ?? 1) * (1 - t) * Math.min(1, t * 12);
    }
    points.visible = true;
    for (const name of ['position', 'color', 'state']) geometry.getAttribute(name).needsUpdate = true;
  }
  /** Follow the endless-hill origin rebase so airborne particles do not jump. */
  function shift(delta: THREE.Vector3) {
    if (delta.lengthSq() === 0) return;
    for (let i = 0; i < capacity; i++) if (styles[i]) { position[i*3]! += delta.x; position[i*3+1]! += delta.y; position[i*3+2]! += delta.z; }
  }
  function clear() { styles.fill(null); state.fill(0); live = 0; points.visible = false; }
  return { points, emit, update, shift, clear, get live() { return live; } };
}
