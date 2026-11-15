import * as THREE from 'three';
import type {RideMode} from '../mode.ts';

/**
 * Procedural sky drawn at the far plane: a horizon-to-zenith gradient that meets the fog colour exactly,
 * a sun with glow, drifting clouds and hazy far ranges. One draw call, no textures.
 */
export function createSky(horizon: THREE.Color, sunDirection: THREE.Vector3) {
  const uniforms = {
    uHorizon: { value: horizon.clone() },
    uZenith: { value: new THREE.Color(0x2f6fb5) },
    uSun: { value: sunDirection.clone().normalize() },
    uSunColor: { value: new THREE.Color(0xfff1d0) },
    uRange: { value: new THREE.Color(0x5f86a6) },
    uTime: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        // Rotation only: the dome stays centred on the viewer and sits on the far plane.
        vec4 clip = projectionMatrix * vec4(mat3(modelViewMatrix) * position, 1.0);
        gl_Position = clip.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uHorizon, uZenith, uSun, uSunColor, uRange;
      uniform float uTime;
      varying vec3 vDirection;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float sum = 0.0, weight = 0.5;
        for (int i = 0; i < 5; i++) { sum += noise(p) * weight; p = p * 2.03 + 17.0; weight *= 0.5; }
        return sum;
      }
      float ridge(float azimuth, float scale, float seed) {
        return noise(vec2(azimuth * scale + seed, seed)) * 0.6 + noise(vec2(azimuth * scale * 2.7 + seed, seed + 4.0)) * 0.28
          + noise(vec2(azimuth * scale * 7.1, seed + 9.0)) * 0.12;
      }
      void main() {
        vec3 dir = normalize(vDirection);
        float height = dir.y, facing = max(dot(dir, uSun), 0.0);
        vec3 color = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.62, height), 0.75));
        // Warm scattering around the sun, then the disc itself.
        color += uSunColor * (pow(facing, 12.0) * 0.16 + pow(facing, 90.0) * 0.35);
        // Clouds on a plane overhead; they thin out and haze over toward the horizon.
        if (height > 0.0) {
          vec2 plane = dir.xz / (height + 0.14) * 1.15 + vec2(uTime * 0.006, uTime * 0.002);
          float cover = smoothstep(0.5, 0.78, fbm(plane) + 0.12 * fbm(plane * 3.1));
          float lit = smoothstep(0.2, 0.9, fbm(plane + uSun.xz * 0.09));
          vec3 cloud = mix(vec3(0.78, 0.84, 0.9), vec3(1.0), lit) + uSunColor * pow(facing, 6.0) * 0.2;
          color = mix(color, cloud, cover * smoothstep(0.03, 0.26, height) * 0.92);
        }
        color += uSunColor * smoothstep(0.99955, 0.9998, dot(dir, uSun)) * 3.0;
        // Two far ranges, each closer to the haze colour than the one in front of it.
        float azimuth = atan(dir.z, dir.x);
        float farRange = 0.018 + 0.085 * ridge(azimuth, 5.0, 3.0), nearRange = 0.004 + 0.06 * ridge(azimuth, 9.0, 21.0);
        color = mix(color, mix(uHorizon, uRange, 0.3), smoothstep(farRange + 0.003, farRange - 0.003, height));
        color = mix(color, mix(uHorizon, uRange, 0.58), smoothstep(nearRange + 0.003, nearRange - 0.003, height));
        // Everything at and below the horizon dissolves into the fog colour the terrain fades to.
        color = mix(uHorizon, color, smoothstep(-0.012, 0.03, height));
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
  mesh.name = 'sky'; mesh.frustumCulled = false; mesh.renderOrder = -1;
  return { mesh, update(dt: number) { uniforms.uTime.value += dt; },setMode(mode:RideMode,horizon:THREE.Color) {
    const snow=mode==='snowboard';uniforms.uHorizon.value.copy(horizon);
    uniforms.uZenith.value.setHex(snow?0x4b88b4:0x2f6fb5);uniforms.uSunColor.value.setHex(snow?0xeaf5ff:0xfff1d0);
    uniforms.uRange.value.setHex(snow?0x91aec8:0x5f86a6);
  }};
}
