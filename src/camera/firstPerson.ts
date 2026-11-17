import * as THREE from 'three';

/** Raw rider view: animated eye height, board-facing yaw and full aerial rotation. */
export function createFirstPersonCamera(camera:THREE.PerspectiveCamera,rider:THREE.Object3D) {
  const head=rider.getObjectByName('head');
  if(!head)throw new Error('First-person camera requires a rider head');
  const offset=new THREE.Vector3();

  function update() {
    // Use the interpolated visual rather than the fixed-step physics body.
    head!.getWorldPosition(camera.position);
    rider.getWorldQuaternion(camera.quaternion);
    offset.set(0,.035,-.06).applyQuaternion(camera.quaternion);
    camera.position.add(offset);
  }

  function render(draw:()=>void) {
    // Hide only during the game render; portraits and crash capture keep the head.
    const visible=head!.visible;
    head!.visible=false;
    try {draw();} finally {head!.visible=visible;}
  }
  return {update,render};
}
