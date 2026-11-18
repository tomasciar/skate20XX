import type {Object3D} from 'three';

/** Selection and the user's visibility preference compose independently and survive crash cloning. */
export function selectHeldWeapon(object:Object3D,selected:boolean) {
  object.userData.weaponSelected=selected;
  object.visible=selected && object.userData.weaponVisible!==false;
}

export function applyWeaponVisibility(root:Object3D,shown:boolean) {
  root.traverse(object=>{
    if(object.userData.characterSlot?.kind==='hand')object.userData.weaponVisible=shown;
    if(!object.userData.heldWeapon)return;
    object.userData.weaponVisible=shown;
    object.visible=shown && object.userData.weaponSelected!==false;
  });
}
