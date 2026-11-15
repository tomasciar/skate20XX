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

// One drop between each pair of flatter stretches. Long shoulders keep fast cresting rideable;
// the extra descent remains in the height afterwards rather than springing back uphill.
const DROP_START=1540, DROP_EASE=490, DROP_LENGTH=DROP_EASE*2;
const DROP_SLOPES=[26,34,28,38].map(degrees=>Math.tan((14-degrees)*Math.PI/180));
const DROP_HEIGHTS=[0];
for(const slope of DROP_SLOPES)DROP_HEIGHTS.push(DROP_HEIGHTS[DROP_HEIGHTS.length-1]!+slope*DROP_EASE);
// Integral of a smoothstep grade, sampled on the same rows as road collision.
const DROP_SAMPLES=Float64Array.from({length:DROP_LENGTH/COURSE_STEP+1},(_,i)=>{
  const along=i*COURSE_STEP;
  if(along<DROP_EASE) {
    const u=along/DROP_EASE;
    return DROP_EASE*(u*u*u-u*u*u*u/2);
  }
  const u=(along-DROP_EASE)/DROP_EASE;
  return DROP_EASE/2+DROP_EASE*(u-u*u*u+u*u*u*u/2);
});
function dropSample(along:number) {
  if(along<DROP_START)return 0;
  const cycle=Math.floor((along-DROP_START)/PERIOD),local=along-DROP_START-cycle*PERIOD;
  const sequence=cycle%DROP_SLOPES.length,rounds=Math.floor(cycle/DROP_SLOPES.length);
  const accumulated=rounds*DROP_HEIGHTS[DROP_HEIGHTS.length-1]!+DROP_HEIGHTS[sequence]!;
  const sample=Math.min(DROP_SAMPLES.length-1,Math.round(local/COURSE_STEP));
  return accumulated+DROP_SLOPES[sequence]!*DROP_SAMPLES[sample]!;
}
/** Shared piecewise-linear profile for road, landscape, collision, and prop placement. */
export function courseHeight(along: number) {
  const cycle=Math.floor(along/PERIOD), sample=(along-cycle*PERIOD)/COURSE_STEP;
  const i=Math.floor(sample), u=sample-i;
  const start=Math.floor(along/COURSE_STEP)*COURSE_STEP;
  return cycle*CYCLE_HEIGHT+(SAMPLES[i]!+dropSample(start))*(1-u)+(SAMPLES[i+1]!+dropSample(start+COURSE_STEP))*u;
}
export function courseSlope(along: number) {
  const cycle=Math.floor(along/PERIOD), i=Math.floor((along-cycle*PERIOD)/COURSE_STEP);
  const start=Math.floor(along/COURSE_STEP)*COURSE_STEP;
  return (SAMPLES[i+1]!-SAMPLES[i]!+dropSample(start+COURSE_STEP)-dropSample(start))/COURSE_STEP;
}

// Broad bends plus a smaller wandering line. The opening stays straight for learning controls.
const CURVE_START=280, CURVE_EASE=280;
const curveSamples=new Map<number,number>();
function curveSample(along: number) {
  let value=curveSamples.get(along);
  if(value===undefined) {
    const distance=Math.max(0,along-CURVE_START),u=Math.min(1,distance/CURVE_EASE);
    // Integrate a smooth turn-in so both heading and curvature start without a kink.
    const phase=distance<CURVE_EASE ? CURVE_EASE*(u*u*u-u*u*u*u/2) : distance-CURVE_EASE/2;
    value=40*Math.sin(phase*Math.PI*2/2200)+5*Math.sin(phase*Math.PI*2/850);
    curveSamples.set(along,value);
    if(curveSamples.size>512)curveSamples.delete(curveSamples.keys().next().value!);
  }
  return value;
}
/** Lateral centerline in the hill frame; interpolate the same 5 m rows used by collision. */
export function courseX(along: number) {
  const start=Math.floor(along/COURSE_STEP)*COURSE_STEP,u=(along-start)/COURSE_STEP;
  return curveSample(start)*(1-u)+curveSample(start+COURSE_STEP)*u;
}
export function courseCurveSlope(along: number) {
  const start=Math.floor(along/COURSE_STEP)*COURSE_STEP;
  return (curveSample(start+COURSE_STEP)-curveSample(start))/COURSE_STEP;
}
/** Horizontal heading after the original hill tilt; used by upright buildings facing the road. */
export function courseHeading(along: number, hillAngle: number) {
  return Math.atan2(-courseCurveSlope(along),Math.cos(hillAngle)-Math.sin(hillAngle)*courseSlope(along));
}
