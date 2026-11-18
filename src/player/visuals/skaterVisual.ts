import * as THREE from 'three';
import {createBoardVisual} from './boardVisual.ts';
import {createRiderRig} from './riderRig.ts';
import {createRiderPose} from '../animation/riderPose.ts';
import {captureRiderRagdoll} from './ragdollCapture.ts';
import {applyRideSkin} from '../../mode.ts';
import type {RideMode} from '../../mode.ts';
import {characterProportions} from '../characters/catalog.ts';
import type {CharacterId} from '../characters/catalog.ts';
import {applyCharacterSkin} from '../characters/skin.ts';
import {applyBoardStyle} from '../../boards.ts';
import type {BoardStyleId} from '../../boards.ts';
import type {SkaterVisual,SkaterAppearance} from './types.ts';

export type {SkaterVisual,SkaterPose} from './types.ts';
export {FLIP_LEAN} from '../animation/riderPose.ts';

/** Assemble the shared rig; builders, appearance, animation and crash capture own their details. */
export function createSkaterVisual(initialMode:RideMode='skate',initialCharacter:CharacterId='boy',initialBoardStyle:BoardStyleId='classic'):SkaterVisual {
  const root=new THREE.Group(),equipment=createBoardVisual();
  const rig=createRiderRig(initialCharacter,equipment.accent);
  const {board,deck,wheels,nimbus}=equipment;
  root.add(board,rig.rider);
  const appearance:SkaterAppearance={mode:initialMode,character:initialCharacter,boardStyle:initialBoardStyle,
    proportions:characterProportions(initialCharacter)};
  const pose=createRiderPose(rig,equipment,appearance);
  function updateAppearance() {
    appearance.proportions=characterProportions(appearance.character);
    rig.updateAppearance(appearance.character,appearance.mode);
    applyCharacterSkin(root,appearance.character);
  }
  function setCharacter(next:CharacterId) {appearance.character=next;updateAppearance();}
  function setMode(next:RideMode) {appearance.mode=next;applyRideSkin(root,next);updateAppearance();}
  function setBoardStyle(next:BoardStyleId) {
    if(next!==appearance.boardStyle)nimbus.reset();
    appearance.boardStyle=next;applyBoardStyle(root,next);
  }
  setMode(initialMode);setBoardStyle(initialBoardStyle);
  return {root,board,deck,wheels,setMode,setBoardStyle,get boardStyle(){return appearance.boardStyle;},
    setCharacter,get character(){return appearance.character;},setPose:pose.setPose,
    captureRagdoll:()=>captureRiderRagdoll(root,rig,appearance.character),
    setRagdoll:pose.setRagdoll,resetPose:pose.resetPose};
}
