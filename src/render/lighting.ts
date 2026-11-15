import * as THREE from 'three';
const skyEnvironments=new WeakMap<THREE.Scene,THREE.WebGLRenderTarget>();

/**
 * The real-time shadow map only serves the rider and board (scenery shadows are baked onto the ground),
 * so it covers a few metres around them: sharp, and almost free to render. It is snapped to whole
 * shadow texels so the shadow does not shimmer as the rider moves.
 */
export function createSunRig(sun: THREE.DirectionalLight, scene: THREE.Scene) {
  const direction = sun.position.clone().normalize(), half = 7, size = 1024, texel = half * 2 / size;
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const camera = sun.shadow.camera;
  camera.left = camera.bottom = -half; camera.right = camera.top = half; camera.near = 1; camera.far = 340;
  camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(size, size);
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.01;
  if (!sun.target.parent) scene.add(sun.target);
  const center = new THREE.Vector3();
  function update(focus: THREE.Vector3) {
    center.copy(focus);
    // Read all three coordinates before rebuilding the point from them.
    const along = center.dot(direction), across = Math.round(center.dot(right) / texel) * texel, rise = Math.round(center.dot(up) / texel) * texel;
    center.copy(right).multiplyScalar(across).addScaledVector(up, rise).addScaledVector(direction, along);
    sun.target.position.copy(center);
    sun.position.copy(center).addScaledVector(direction, 170);
    sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
  }
  return { update, direction };
}

/** Image-based light from the sky itself, so metal, glass and painted surfaces pick up sky colour. */
export function applySkyEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene, sky: THREE.Mesh, intensity = 0.55) {
  const generator = new THREE.PMREMGenerator(renderer), stage = new THREE.Scene();
  const copy = sky.clone(); copy.scale.setScalar(1); stage.add(copy);
  const previous=skyEnvironments.get(scene),environment=generator.fromScene(stage,0,0.1,10);
  scene.environment=environment.texture;skyEnvironments.set(scene,environment);
  previous?.dispose();
  scene.environmentIntensity = intensity;
  generator.dispose();
}
