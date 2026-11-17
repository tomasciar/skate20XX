// Public character selection API; model construction lives under player/characters.
export {CHARACTERS,CHARACTER_STORAGE_KEY,isCharacterId,loadCharacter,saveCharacter,characterPalette,characterProportions,characterHasShorts,characterHasCartoonHands} from './player/characters/catalog.ts';
export type {CharacterId,CharacterPalette} from './player/characters/catalog.ts';
export {applyCharacterSkin} from './player/characters/skin.ts';
