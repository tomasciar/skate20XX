import * as THREE from 'three';
import {markAsset} from './variety.ts';
import {stone, leaf, logEnd, trunkMaterial, birchBark, leaves, cedarLeaf, birchLeaf, autumn, blossom, snagWood, unitBlob, unitRock, treeTrunk, treePine, treeCrown, pick, group, part, box, post} from './parts.ts';
import type {District} from '../environments/catalog.ts';
import type {TreeStyle} from '../environments/catalog.ts';
import {ENVIRONMENT_BY_ID} from '../environments/catalog.ts';

export const treeStyleFor = (district: District, rng: () => number) => pick(ENVIRONMENT_BY_ID.get(district)!.trees, rng);

export function makeTree(rng: () => number, style: TreeStyle = 'broadleaf') {
  const tree = group();
  tree.userData.treeStyle=style;
  tree.userData.shadow = style === 'snag' ? 'box' : 'round';
  const trunk = (mat: THREE.Material, height = 1.6, width = 1) => {
    const m = new THREE.Mesh(treeTrunk, mat); m.scale.set(width,height/1.6,width); m.position.y = height/2; m.castShadow = true; tree.add(m); return m;
  };
  const crown = (geometry: THREE.BufferGeometry, mat: THREE.Material, size: number[], at: number[]) => {
    const m = new THREE.Mesh(geometry, mat); m.scale.set(size[0]!,size[1]!,size[2]!); m.position.set(at[0]!,at[1]!,at[2]!);
    m.userData.variantPart='crown';m.castShadow = true; tree.add(m); return m;
  };
  if (style === 'pine' || style === 'cedar') {
    const cedar = style === 'cedar', mat = cedar ? cedarLeaf : pick(leaves, rng);
    const tiers = cedar ? 2 : 3, spread = cedar ? 0.62+rng()*0.2 : 0.85+rng()*0.4, height = cedar ? 2.3+rng()*0.9 : 1.25+rng()*0.5;
    trunk(trunkMaterial, cedar ? 2.2 : 1.6);
    // Stacked, shrinking tiers read as a conifer from the fixed chase angle.
    for (let i = 0, y = cedar ? 1.5 : 1.0; i < tiers; i++) {
      const scale = 1 - i*(cedar ? 0.3 : 0.26);
      crown(treePine, mat, [spread*scale, height/3.5*(1+0.12*i)*scale+0.18, spread*scale], [0, y+height*scale/2*0.9+0.4, 0]).rotation.y = rng()*Math.PI;
      y += height*scale*(cedar ? 0.62 : 0.5);
    }
  } else if (style === 'snag') {
    trunk(snagWood, 3.2+rng()*1.5, 0.8);
    for (let i = 0; i < 3; i++) {
      const branch = box(tree, [0.09,0.9+rng()*0.7,0.09], [0,1.6+i*0.7,0], snagWood);
      branch.rotation.set(0, rng()*Math.PI*2, 0.9+rng()*0.5); branch.translateY(0.4);
    }
  } else {
    const birch = style === 'birch', fruit = style === 'fruit';
    const mat = birch ? birchLeaf : style === 'autumn' ? pick(autumn, rng) : fruit ? (rng() < 0.35 ? blossom : leaves[3]!) : pick(leaves, rng);
    const height = fruit ? 1.1 : birch ? 2.6 : 1.6;
    trunk(birch ? birchBark : trunkMaterial, height, birch ? 0.55 : fruit ? 0.7 : 1);
    const size = fruit ? 0.62 : birch ? 0.6 : 1;
    crown(treeCrown, mat, [size*(0.75+rng()*0.5), size*(0.7+rng()*0.6), size*(0.75+rng()*0.5)], [0, height+size*0.6, 0]);
    // Offset lobes break up the single-ball silhouette.
    for (let i = 0, lobes = fruit ? 1 : 2+Math.floor(rng()*2); i < lobes; i++) {
      const angle = rng()*Math.PI*2, reach = size*(0.55+rng()*0.35), lobe = size*(0.45+rng()*0.3);
      crown(treeCrown, mat, [lobe,lobe*(0.8+rng()*0.3),lobe], [Math.cos(angle)*reach, height+size*(0.35+rng()*0.75), Math.sin(angle)*reach]);
    }
  }
  const s = style === 'fruit' ? 0.9+rng()*0.3 : 0.65+rng()*1.0;
  tree.scale.set(s, style === 'fruit' ? s : 0.75+rng()*1.05, s);
  return markAsset(tree,'tree');
}

export function makeBush(rng: () => number, mat: THREE.Material = leaf) {
  const g = group(); g.userData.shadow = 'round';
  for (let i = 0, count = 2+Math.floor(rng()*3); i < count; i++) {
    const size = 0.7+rng()*0.6;
    part(g, unitBlob, [size*1.2,size*0.85,size*1.2], [i ? (rng()-0.5)*1.3 : 0, size*0.3, i ? (rng()-0.5)*1.3 : 0], mat);
  }
  return markAsset(g,'bush');
}

export function makeRocks(rng: () => number, scale = 1) {
  const g = group(); g.userData.shadow = 'round';
  for (let i = 0; i < 3; i++) {
    const size = (1.4+rng()*2)*scale;
    const rock = part(g, unitRock, [size*(1+rng()), size*(0.7+rng()), size], [i ? (rng()-0.5)*3*scale : 0, 0.4*scale, i ? (rng()-0.5)*3*scale : 0], stone);
    rock.rotation.set(rng(), rng(), rng());
  }
  return markAsset(g,'rocks');
}

export function makeStump(rng: () => number) {
  const g = group(), d = 0.5+rng()*0.4; g.userData.shadow = 'round';
  post(g, d, 0.45, [0,0.22,0], trunkMaterial); post(g, d*0.86, 0.04, [0,0.46,0], logEnd); return markAsset(g,'stump');
}

export function makeHedge(length = 7) {
  const g = group('slope');
  box(g, [length,1.05,0.75], [0,0.5,0], leaf);
  box(g, [length-0.3,0.2,0.55], [0,1.1,0], leaves[1]!);
  return markAsset(g,'hedge');
}

export function makeCairn(rng: () => number) {
  const g = group('slope'); g.userData.shadow = 'round';
  for (let i = 0, y = 0; i < 4; i++) {
    const size = 0.75-i*0.14;
    const rock = part(g, unitRock, [size*1.15,size*0.6,size], [0,y+size*0.3,0], stone); rock.rotation.y = rng()*3; y += size*0.5;
  }
  return markAsset(g,'cairn');
}
