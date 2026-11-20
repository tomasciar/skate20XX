import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

// Explicit families keep routine checks small. `npm test` still discovers the entire suite.
const groups={
  movement:['airRotation','carve','flipLean','grabs','grind','groundTricks','landing','multiTricks','ollie','pump','ragdoll','respawn','rideContact','sensitivity','slide','speed','surfaceRiding'],
  characters:['airPose','boards','characterLoading','characterRefinements','characterRegistry','characters','cruisePose','faceArtwork','nimbus','pose','refinedFaces','riderPortrait','sahur','trickFeet','weaponVisibility'],
  world:['city','course','districts','environment','environments','exploration','looseProps','places','rampShapes','ridingStructures','startPlatform','streaming','terrainAdventure','variety','worldExpansion'],
  ui:['audio','camera','hudOptions','mode','modeControls','renderQuality','score'],
  game:['game'],
};
const group=process.argv[2],names=groups[group];
if(!names){console.error(`Choose a test group: ${Object.keys(groups).join(', ')}`);process.exit(2);}
const directory=new URL('../tests/',import.meta.url),available=new Set(readdirSync(directory));
const files=names.map(name=>{
  const file=`${name}.test.ts`;
  if(!available.has(file))throw Error(`Missing test file in ${group}: ${file}`);
  return fileURLToPath(new URL(file,directory));
});
const result=spawnSync(process.execPath,['--experimental-strip-types','--test',...process.argv.slice(3),...files],{stdio:'inherit'});
if(result.error)console.error(result.error.message);
process.exit(result.status??1);
