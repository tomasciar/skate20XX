import * as THREE from 'three';
import type { District } from './generation.ts';

const material = (color: number, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness });
const wood = material(0x886044), stone = material(0x879295), white = material(0xf5e6c7);
const dark = material(0x263b43), glass = material(0x719ba7, 0.3), orange = material(0xf27635);
const roof = material(0x874c3f), leaf = material(0x668c55), metal = material(0x53646b, 0.5);
const unitBox = new THREE.BoxGeometry(1,1,1);
unitBox.userData.shared = true;
const paints = [0xdab786, 0x88a6a0, 0xc99578].map(c => material(c));
function box(g: THREE.Group, size: number[], at: number[], mat: THREE.Material) {
  const m = new THREE.Mesh(unitBox, mat);
  m.scale.set(size[0]!, size[1]!, size[2]!);
  m.position.set(at[0]!, at[1]!, at[2]!); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
}
export function makeCone() {
  const g = new THREE.Group();
  box(g, [0.5, 0.06, 0.5], [0, 0.03, 0], dark);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.65, 10), orange);
  cone.position.y = 0.38; g.add(cone);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.13, 0.12, 10), white);
  band.position.y = 0.38; g.add(band); return g;
}
export function makeScenery(district: District, variant: number, rng: () => number) {
  const g = new THREE.Group();
  if (district === 'village' && variant % 3 === 0) {
    g.userData.placement = 'pad';
    const w = 4 + rng() * 3, h = 3 + rng() * 3;
    box(g, [w+0.2, 1.8, 5.2], [0, -0.9, 0], stone);
    box(g, [w, h, 5], [0, h / 2, 0], paints[Math.floor(rng()*paints.length)]!);
    const top = new THREE.Mesh(new THREE.ConeGeometry(w * 0.82, 2, 4), roof);
    top.rotation.y = Math.PI / 4; top.position.y = h + 0.8; g.add(top);
    for (const y of h > 4.6 ? [1.6,3.5] : [1.6]) for (const x of [-w*0.28,w*0.28]) {
      box(g,[1,1.1,0.08],[x,y,2.54],white);
      box(g,[0.8,0.9,0.09],[x,y,2.6],glass);
    }
    box(g, [0.9, 1.9, 0.1], [0, 0.95, 2.56], wood);
    box(g, [0.6, 1.6, 0.7], [w * 0.25, h + 1, 0], stone);
  } else if (district === 'village' && variant % 3 === 1) {
    g.userData.placement = 'pad';
    // Parked car, set well outside the rideable road.
    box(g, [1.9, 0.7, 3.8], [0, 0.7, 0], paints[Math.floor(rng() * 3)]!);
    box(g, [1.65, 0.7, 1.9], [0, 1.3, 0.1], glass);
    box(g, [1.9, 0.1, 1.9], [0, 1.7, 0.1], dark);
    for (const x of [-0.92, 0.92]) for (const z of [-1.2, 1.2]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.24, 10), dark);
      wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.4, z); g.add(wheel);
    }
    for (const x of [-0.65, 0.65]) box(g, [0.35, 0.2, 0.05], [x, 0.8, 1.92], white);
  } else if (district === 'ridge' || variant % 4 === 0) {
    for (let i = 0; i < 3; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + rng()), stone);
      rock.scale.set(1 + rng(), 0.7 + rng(), 1); rock.position.set((rng() - 0.5) * 3, 0.4, (rng() - 0.5) * 3);
      rock.rotation.set(rng(), rng(), rng()); rock.castShadow = true; g.add(rock);
    }
  } else if (variant % 3 === 1) {
    g.userData.placement = 'pad';
    box(g, [2.5, 0.14, 0.7], [0, 0.6, 0], wood);
    box(g, [2.5, 0.65, 0.12], [0, 1, 0.32], wood);
    for (const x of [-0.9, 0.9]) box(g, [0.12, 0.6, 0.65], [x, 0.3, 0], metal);
  } else {
    g.userData.placement = 'pad';
    box(g, [1.6, 0.5, 1.6], [0, 0.25, 0], wood);
    for (let i = 0; i < 4; i++) {
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), leaf);
      bush.position.set((rng() - 0.5), 0.7, (rng() - 0.5)); g.add(bush);
    }
  }
  return g;
}
export function makeSign(district: District, index: number) {
  const g = new THREE.Group();
  box(g, [0.1, 2.5, 0.1], [0, 1.25, 0], metal);
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#193f3b'; ctx.fillRect(0, 0, 512, 192);
  ctx.strokeStyle = '#ecd7a5'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, 496, 176);
  ctx.fillStyle = '#fff1d6'; ctx.textAlign = 'center'; ctx.font = 'bold 40px sans-serif';
  ctx.fillText(district === 'grove' ? 'CEDAR GROVE' : district === 'village' ? 'OLD TOWN' : 'SUMMIT RIDGE', 256, 80);
  ctx.font = '26px sans-serif'; ctx.fillText(`${index * 70} m  /  KEEP ROLLING`, 256, 135);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  box(g, [2.8, 1.05, 0.12], [0, 2.2, 0], new THREE.MeshStandardMaterial({ map }));
  return g;
}

/** Rustic field fences, picnic tables and trail-side shelters share existing materials. */
export function makeFence(length = 9) {
  const g = new THREE.Group(); g.userData.placement = 'slope';
  for (let x = -length/2; x <= length/2 + 0.01; x += length/3) box(g,[0.13,1.15,0.13],[x,0.575,0],wood);
  for (const y of [0.45,0.9]) box(g,[length,0.10,0.10],[0,y,0],wood);
  return g;
}
export function makePicnic() {
  const g = new THREE.Group(); g.userData.placement = 'pad';
  box(g,[2.5,0.12,1.1],[0,0.85,0],wood);
  for (const z of [-0.9,0.9]) box(g,[2.5,0.12,0.35],[0,0.48,z],wood);
  for (const x of [-0.8,0.8]) {
    box(g,[0.13,0.85,1.7],[x,0.425,0],metal);
  }
  return g;
}

export const foundationMaterial = stone;
