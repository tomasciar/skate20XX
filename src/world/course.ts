/** Height relative to the original 14-degree hill plane. Most of the route still descends. */
export const COURSE_STEP = 5;
const PERIOD = 2240;
const FLAT = Math.tan(14*Math.PI/180), RISE = Math.tan(15.5*Math.PI/180), DESCENT = 0;
const KNOTS = [0,280,490,560,770,1050,1260,1330,1540,1820,2030,2240];
const SLOPES = [0,0,FLAT,FLAT,DESCENT,DESCENT,RISE,RISE,DESCENT,DESCENT,0,0];
const HEIGHTS = [0];
for (let i=0;i<KNOTS.length-1;i++) HEIGHTS.push(HEIGHTS[i]!+(KNOTS[i+1]!-KNOTS[i]!)*(SLOPES[i]!+SLOPES[i+1]!)/2);
function exactHeight(along: number) {
  const cycle=Math.floor(along/PERIOD), local=along-cycle*PERIOD;
  let i=0; while(i<KNOTS.length-2 && KNOTS[i+1]!<local)i++;
  const length=KNOTS[i+1]!-KNOTS[i]!, u=(local-KNOTS[i]!)/length, a=SLOPES[i]!, b=SLOPES[i+1]!;
  return cycle*HEIGHTS[HEIGHTS.length-1]!+HEIGHTS[i]!+length*(a*u+(b-a)*(u*u*u-u*u*u*u/2));
}
// Sample once rather than integrating the profile for every terrain/prop vertex.
const SAMPLES = Float64Array.from({length: PERIOD/COURSE_STEP+1},(_,i)=>exactHeight(i*COURSE_STEP));
const CYCLE_HEIGHT = SAMPLES[SAMPLES.length-1]!;
/** Shared piecewise-linear profile for road, landscape, collision, and prop placement. */
export function courseHeight(along: number) {
  const cycle=Math.floor(along/PERIOD), sample=(along-cycle*PERIOD)/COURSE_STEP;
  const i=Math.floor(sample), u=sample-i;
  return cycle*CYCLE_HEIGHT+SAMPLES[i]!*(1-u)+SAMPLES[i+1]!*u;
}
export function courseSlope(along: number) {
  const cycle=Math.floor(along/PERIOD), i=Math.floor((along-cycle*PERIOD)/COURSE_STEP);
  return (SAMPLES[i+1]!-SAMPLES[i]!)/COURSE_STEP;
}
