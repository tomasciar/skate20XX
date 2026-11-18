import * as THREE from 'three';
import {markAsset} from './variety.ts';
import {wood, stone, white, dark, glass, coneOrange, leaf, metal, roofs, sheet, concrete, blossom, unitBlob, group, part, box, post, log, gableRoof} from './parts.ts';
import {DISTRICT_NAMES} from '../planning/generation.ts';
import type {District} from '../environments/catalog.ts';
import {facadeMaterial} from '../rendering/appearance.ts';

export function makeCone() {
  const g = group(); g.userData.shadow = 'none';
  box(g, [0.5, 0.06, 0.5], [0, 0.03, 0], dark);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.65, 10), coneOrange);
  cone.position.y = 0.38; g.add(cone);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.13, 0.12, 10), white);
  band.position.y = 0.38; g.add(band); return markAsset(g,'cone');
}

export function makeBench() {
  const g = group('pad');
  box(g, [2.5, 0.14, 0.7], [0, 0.6, 0], wood);
  box(g, [2.5, 0.65, 0.12], [0, 1, 0.32], wood);
  for (const x of [-0.9, 0.9]) box(g, [0.12, 0.6, 0.65], [x, 0.3, 0], metal);
  return markAsset(g,'bench');
}

export function makePlanter(rng: () => number) {
  const g = group('pad');
  box(g, [1.6, 0.5, 1.6], [0, 0.25, 0], wood);
  for (let i = 0; i < 4; i++) part(g, unitBlob, [1.1,1.1,1.1], [i ? (rng()-0.5) : 0, 0.7, i ? (rng()-0.5) : 0], i === 2 ? blossom : leaf);
  return markAsset(g,'planter');
}

export function makeBusStop() {
  const g = group('pad');
  box(g, [3.2,0.1,1.5], [0,0.05,0], concrete);
  for (const x of [-1.5,1.5]) for (const z of [-0.6,0.6]) box(g, [0.08,2.3,0.08], [x,1.2,z], metal);
  box(g, [3,1.6,0.06], [0,1.35,-0.6], glass);
  for (const x of [-1.5,1.5]) box(g, [0.06,1.6,1.1], [x,1.35,-0.05], glass);
  box(g, [3.5,0.1,1.7], [0,2.38,0.05], dark).rotation.x = 0.06;
  box(g, [2.2,0.1,0.42], [0,0.5,-0.3], wood);
  for (const x of [-0.9,0.9]) box(g, [0.08,0.45,0.36], [x,0.27,-0.3], metal);
  return markAsset(g,'bus-stop');
}

export function makeWell() {
  const g = group('pad');
  post(g, 1.9, 0.8, [0,0.4,0], stone); post(g, 1.45, 0.06, [0,0.8,0], dark);
  for (const x of [-0.85,0.85]) box(g, [0.14,2.1,0.14], [x,1.45,0], wood);
  gableRoof(g, 2.2, 1.5, 0.55, 2.45, roofs[0]!, wood, false, 0.2);
  log(g, 0.16, 1.7, [0,2.1,0], wood);
  return markAsset(g,'well');
}

/** Paved strip laid on the slope: garden paths and driveways. Too thin to matter to a wheel. */
export function makePaving(length: number, width: number, mat: THREE.Material = concrete) {
  const g = group('slope'); g.userData.collision = false; g.userData.shadow = 'none';
  box(g, [length,0.05,width], [0,0.03,0], mat).castShadow = false;
  return markAsset(g,'paving');
}

export function makeSign(district: District, index: number) {
  const g = group();
  for (const x of [-1.1,1.1]) box(g, [0.12, 2.9, 0.12], [x, 1.45, 0], wood);
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#193f3b'; ctx.fillRect(0, 0, 512, 192);
  ctx.strokeStyle = '#ecd7a5'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, 496, 176);
  ctx.fillStyle = '#fff1d6'; ctx.textAlign = 'center'; ctx.font = 'bold 40px sans-serif';
  ctx.fillText(DISTRICT_NAMES[district], 256, 80);
  ctx.font = '26px sans-serif'; ctx.fillText(`${index * 70} m  /  KEEP ROLLING`, 256, 135);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const face = facadeMaterial(new THREE.MeshStandardMaterial({ map })); face.userData.perChunk = true;
  box(g, [3.1, 1.16, 0.12], [0, 2.3, 0], face);
  box(g, [3.3, 0.12, 0.2], [0, 2.95, 0], wood);
  return markAsset(g,'sign');
}

/** Rustic field fences, picnic tables and trail-side shelters share existing materials. */
export function makeFence(length = 9) {
  const g = group('slope');
  for (let x = -length/2; x <= length/2 + 0.01; x += length/3) box(g,[0.13,1.15,0.13],[x,0.575,0],wood);
  for (const y of [0.45,0.9]) box(g,[length,0.10,0.10],[0,y,0],wood);
  return markAsset(g,'fence');
}

/** Yard fencing: steel posts with mesh panels. */
export function makeYardFence(length = 9) {
  const g = group('slope');
  for (let x = -length/2; x <= length/2 + 0.01; x += length/3) post(g,0.09,1.9,[x,0.95,0],metal);
  box(g,[length,1.5,0.04],[0,1.05,0],sheet); box(g,[length,0.06,0.07],[0,1.85,0],metal);
  return markAsset(g,'yard-fence');
}

export function makePicnic() {
  const g = group('pad');
  box(g,[2.5,0.12,1.1],[0,0.85,0],wood);
  for (const z of [-0.9,0.9]) box(g,[2.5,0.12,0.35],[0,0.48,z],wood);
  for (const x of [-0.8,0.8]) {
    box(g,[0.13,0.85,1.7],[x,0.425,0],metal);
  }
  return markAsset(g,'picnic');
}

export function makeLamp(side: number, rng: () => number) {
  const root = group(), height = 3.2*(0.85+rng()*0.4);
  post(root, 0.12, height, [0,height/2,0], metal);
  post(root, 0.2, 0.3, [0,0.15,0], dark);
  box(root, [0.9,0.07,0.07], [-side*0.4,height-0.05,0], metal);
  box(root, [0.5,0.1,0.22], [-side*0.7,height-0.1,0], dark);
  box(root, [0.4,0.03,0.16], [-side*0.7,height-0.16,0], white);
  return markAsset(root,'lamp');
}
