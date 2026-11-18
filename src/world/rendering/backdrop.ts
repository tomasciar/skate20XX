import * as THREE from 'three';
import {SUN_DIRECTION} from './shadows.ts';
import {type WorldSeason} from './season.ts';

export function addBackdrop(scene: THREE.Scene) {
  scene.background = new THREE.Color(0x8ebfd4);
  // Full visibility to 120 m; fade out by 300 m, before the streamed road ends.
  scene.fog = new THREE.Fog(0x8ebfd4, 120, 300);

  const hemisphere=new THREE.HemisphereLight(0xdcefff, 0x6f8f58, 0.95);scene.add(hemisphere);
  const ambient=new THREE.AmbientLight(0xd0e4f0, 0.2);scene.add(ambient);

  // Mid-morning sun from up the left flank: trees and buildings throw shadows across the road.
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.1);
  sun.name = "sun";
  sun.position.copy(SUN_DIRECTION).multiplyScalar(100);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 280;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.bias = -0.0002;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xb8d4e8, 0.35);
  fill.position.set(40, 30, -20);
  scene.add(fill);
  return {setSeason(season:WorldSeason) {
    const snow=season==='winter',horizon=snow?0xc6dce9:0x8ebfd4;
    (scene.background as THREE.Color).setHex(horizon);(scene.fog as THREE.Fog).color.setHex(horizon);
    hemisphere.color.setHex(snow?0xe5f3ff:0xdcefff);hemisphere.groundColor.setHex(snow?0x97b4cc:0x6f8f58);
    ambient.color.setHex(snow?0xdceeff:0xd0e4f0);sun.color.setHex(snow?0xf5f9ff:0xfff0d6);
    fill.color.setHex(snow?0xb5d5ef:0xb8d4e8);
  }};
}

