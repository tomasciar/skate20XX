import * as THREE from "three";

/** Automatic course-following camera; rider steering never orbits it. */
export function createChaseCamera(camera: THREE.PerspectiveCamera, courseForward: THREE.Vector3) {
  const pos = new THREE.Vector3(0, 8, 12);
  const look = new THREE.Vector3();
  const desired = new THREE.Vector3();
  // Capture the course direction once. Steering and speed never rotate or zoom the camera.
  const heading = courseForward.clone().setY(0);
  if (heading.lengthSq() < 1e-4) heading.set(0, 0, -1);
  heading.normalize();
  const desiredHeading=heading.clone();
  const followDistance = 7.8;

  function update(dt: number, target: THREE.Vector3, courseDirection?: THREE.Vector3) {
    if(courseDirection) {
      desiredHeading.copy(courseDirection).setY(0).normalize();
      heading.lerp(desiredHeading,1-Math.exp(-3*dt)).normalize();
    }
    // High and behind, looking down the hill past the skater (Skate's default follow).
    desired.copy(target).addScaledVector(heading, -followDistance);
    desired.y = target.y + 5.6;

    pos.x = THREE.MathUtils.damp(pos.x, desired.x, 6, dt);
    pos.y = THREE.MathUtils.damp(pos.y, desired.y, 5, dt);
    pos.z = THREE.MathUtils.damp(pos.z, desired.z, 6, dt);
    if (pos.y < target.y + 4.2) pos.y = target.y + 4.2;

    look.copy(target).addScaledVector(heading, 7);
    look.y = target.y + 0.25;

    camera.position.copy(pos);
    camera.lookAt(look);
  }

  function snap(target: THREE.Vector3, courseDirection?: THREE.Vector3) {
    if(courseDirection)heading.copy(courseDirection).setY(0).normalize();
    pos.copy(target).addScaledVector(heading, -followDistance);
    pos.y = target.y + 5.6;
    look.copy(target).addScaledVector(heading, 7);
    look.y = target.y + 0.25;
    camera.position.copy(pos);
    camera.lookAt(look);
  }

  /** Move with the endless-hill origin rebase so follow damping never sees a teleport. */
  function shift(delta: THREE.Vector3) {
    if (delta.lengthSq() === 0) return;
    pos.add(delta);
    look.add(delta);
    camera.position.copy(pos);
  }

  return { update, snap, shift };
}
