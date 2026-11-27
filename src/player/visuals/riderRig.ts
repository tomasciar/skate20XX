import {rigTraits} from '../characters/traits.ts';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {FOOT_Y,RIDER} from '../dimensions.ts';
import {characterTorsoGeometry,limbGeometry,characterLegGeometry,characterHandGeometry} from '../characters/geometry.ts';
import {characterPalette,characterProportions,characterHasShorts} from '../characters/catalog.ts';
import type {CharacterId} from '../characters/catalog.ts';
import type {RideMode} from '../../mode.ts';
import {addCharacterLooks,addCharacterLimbDetails,addCharacterShoeDetails,addCharacterHipDetails,addCharacterHandDetails} from '../characters/visuals.ts';
import {visualMaterial as mat,meshPart as mesh,boxPart as box,batchStaticMeshes} from './parts.ts';

/** Build the shared bones and deferred attachment sites, without creating animation state. */
export function createRiderRig(initialCharacter:CharacterId,accent:THREE.Material) {
  const rider=new THREE.Group();rider.userData.characterBuild='rider';
  const skin = mat(0xc48a65), shirt = mat(0x267a79), pants = mat(0x293b4a);
  const thighSurface=mat(0x293b4a),shinSurface=mat(0x293b4a);
  const armSurface=mat(0xc48a65),sleeveSurface=mat(0x267a79),shoulderSurface=mat(0x267a79);
  const gloves=mat(0x202e32),kneeSurface=mat(0x202e32);
  const shoes = mat(0x253035), sole = mat(0xece1c7);
  rider.rotation.y = RIDER.stanceY;
  const hips = new THREE.Group(); rider.add(hips);
  const pelvis = mesh(hips, new THREE.CapsuleGeometry(0.11, 0.1, 4, 10), pants); pelvis.rotation.z = Math.PI / 2;
  pelvis.name='pelvis';pelvis.userData.characterBuild='pelvis';
  const hipDetails=addCharacterHipDetails(hips);
  const torso = new THREE.Group(); hips.add(torso);
  const chest = mesh(torso, characterTorsoGeometry(initialCharacter), shirt, 0, 0.23, 0);
  chest.name = 'chest';chest.userData.characterBuild='chest';
  chest.scale.z = 0.65;
  box(torso, [0.23, 0.025, 0.15], shirt, 0, 0.065, 0);
  mesh(torso, new THREE.CylinderGeometry(0.044, 0.05, 0.07, 10), skin, 0, 0.44, 0);
  const head = new THREE.Group(); head.position.y = 0.53; torso.add(head);
  head.name = 'head';
  addCharacterLooks(head,torso);
  function arm(side: number) {
    const shoulder=mesh(torso,new THREE.SphereGeometry(.055,12,10),shoulderSurface);
    const upper = mesh(torso, limbGeometry('upperarm'), armSurface);
    const sleeve = mesh(torso, limbGeometry('sleeve'), sleeveSurface);
    const fore = mesh(torso, limbGeometry('forearm'), armSurface);
    const elbow = mesh(torso, new THREE.SphereGeometry(0.034, 10, 8), armSurface);
    const hand = mesh(torso, characterHandGeometry(side,false), gloves);
    addCharacterLimbDetails(upper,'upperarm',side);addCharacterLimbDetails(fore,'forearm',side);
    sleeve.name = `sleeve-${side}`;sleeve.userData.characterBuild='sleeve';
    upper.name = `upper-arm-${side}`;upper.userData.characterBuild='upperarm';
    fore.name = `forearm-${side}`;fore.userData.characterBuild='forearm';
    hand.name = `hand-${side}`;
    hand.userData.characterBuild='hand';hand.userData.handSide=side;
    addCharacterHandDetails(hand,side);
    shoulder.name=`shoulder-${side}`;shoulder.userData.characterBuild='shoulder';
    elbow.name = `elbow-${side}`;
    elbow.userData.characterBuild='elbow';
    return {side,shoulder,upper,sleeve,fore,elbow,hand};
  }
  const arms = [arm(-1), arm(1)];
  function leg(side: number) {
    const thigh = mesh(rider, characterLegGeometry('thigh'), thighSurface);
    thigh.name = `thigh-${side}`;
    thigh.userData.characterBuild='thigh';
    const shin = mesh(rider, characterLegGeometry('shin'), shinSurface);
    const knee = mesh(rider, new THREE.SphereGeometry(0.063, 10, 8), kneeSurface);
    addCharacterLimbDetails(thigh,'thigh',side);addCharacterLimbDetails(shin,'shin',side);
    knee.name = `knee-${side}`;
    knee.userData.characterBuild='knee';
    shin.name = `shin-${side}`;
    shin.userData.characterBuild='shin';
    const foot = new THREE.Group(); foot.position.set(side * 0.255, FOOT_Y, 0); rider.add(foot);
    foot.name = `foot-${side}`;
    foot.userData.characterBuild='foot';
    mesh(foot,new RoundedBoxGeometry(0.115,0.027,0.23,2,0.009),sole,0,-0.005,-0.025);
    mesh(foot,new RoundedBoxGeometry(0.105,0.055,0.21,2,0.014),shoes,0,0.03,-0.02);
    for (let i = 0; i < 3; i++) box(foot, [0.07, 0.005, 0.008], sole, 0, 0.06, -0.015 - i * 0.025);
    batchStaticMeshes(foot);addCharacterShoeDetails(foot);
    const boot=new THREE.Group();boot.userData.rideSkin='snowboard';foot.add(boot);
    mesh(boot,new RoundedBoxGeometry(0.111,0.1,0.125,2,0.012),shoes,0,0.10,0.012);
    box(boot,[0.115,0.013,0.13],accent,0,0.113,0.012);batchStaticMeshes(boot);
    return {side,thigh,shin,knee,foot};
  }
  const legs = [leg(-1), leg(1)];
  function updateAppearance(character:CharacterId,mode:RideMode) {
    const proportions=characterProportions(character);
    head.position.y=proportions.headHeight;
    const palette=characterPalette(character,mode);
    skin.color.setHex(palette.skin);shirt.color.setHex(palette.shirt);pants.color.setHex(palette.pants);armSurface.color.setHex(palette.arms);
    thighSurface.color.setHex(characterHasShorts(character)?palette.skin:palette.pants);
    shinSurface.color.setHex(characterHasShorts(character)?palette.skin:palette.pants);
    sleeveSurface.color.setHex(palette.sleeves);
    const traits=rigTraits(character);
    shoulderSurface.color.setHex(traits.shirtShoulders?palette.shirt:palette.sleeves);
    shoes.color.setHex(palette.shoes);gloves.color.setHex(palette.gloves);kneeSurface.color.setHex(palette.knees);
    sole.color.setHex(traits.sole);
  }
  return {rider,hips,pelvis,hipDetails,torso,chest,head,arms,legs,updateAppearance};
}
export type RiderRig=ReturnType<typeof createRiderRig>;
