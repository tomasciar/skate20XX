import {group,box,post,part,unitPyramid,wood,metal,dark,white,leaf,stone,blossom,paints} from './parts.ts';
import {markAsset} from './variety.ts';

export function makeHarborCrate() {
  const root=markAsset(group('pad'),'harbor-crate');
  box(root,[1.25,.95,1.1],[0,.475,0],wood);
  for(const x of [-.46,.46])box(root,[.09,1,.12],[x,.5,.51],metal).userData.collision=false;
  for(const y of [.18,.76])box(root,[1.3,.08,.08],[0,y,.57],white).userData.collision=false;
  box(root,[1.27,.06,1.12],[0,.98,0],wood);return root;
}
export function makeBollard() {
  const root=markAsset(group('pad'),'harbor-bollard');
  post(root,.7,.08,[0,.04,0],dark);post(root,.3,.65,[0,.39,0],metal);
  box(root,[.85,.18,.32],[0,.75,0],metal);return root;
}
export function makeCactus() {
  const root=markAsset(group(),'cactus');root.userData.shadow='round';
  post(root,.48,2.3,[0,1.15,0],leaf);
  for(const [side,height] of [[-1,1.3],[1,.9]]) {
    box(root,[.65,.23,.23],[side!*.4,height,0],leaf);
    post(root,.25,.85,[side!*.68,height!+.35,0],leaf);
  }
  const bloom=part(root,unitPyramid,[.24,.18,.24],[0,2.39,0],blossom);bloom.userData.collision=false;return root;
}
export function makeGardenLantern() {
  const root=markAsset(group('pad'),'garden-lantern');
  box(root,[.8,.16,.8],[0,.08,0],stone);post(root,.3,.7,[0,.51,0],stone);
  box(root,[.7,.18,.7],[0,.95,0],stone);box(root,[.48,.42,.48],[0,1.25,0],dark);
  for(const side of [-1,1])box(root,[.27,.24,.03],[0,1.25,side*.255],white).userData.collision=false;
  part(root,unitPyramid,[1.05,.4,1.05],[0,1.66,0],stone);return root;
}
export function makeSkiRack() {
  const root=markAsset(group('pad'),'ski-rack');
  for(const x of [-1.1,1.1])box(root,[.14,1.15,.6],[x,.57,0],wood);
  box(root,[2.4,.13,.18],[0,1.05,0],wood);
  for(let i=0;i<6;i++) {
    const ski=box(root,[.13,1.65,.06],[-.8+i*.32,.825,.15],paints[i%paints.length]!);
    ski.rotation.z=(i-2.5)*.035;ski.userData.collision=false;ski.userData.sceneryTint=[0xb95040,0xe2b754,0x5e90a5][i%3];
  }
  return root;
}
