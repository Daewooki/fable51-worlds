/** Original deterministic traffic schedule. Time is scene seconds, including
 * replay/freeze. Both bounding intersections share this simplified coordination;
 * it represents plausible operations, not a claim about SFMTA signal timing. */
export type SignalAspect='green'|'amber'|'red';
export const SIGNAL_PERIOD=120;
export function signalPhase(t:number){return((t%SIGNAL_PERIOD)+SIGNAL_PERIOD)%SIGNAL_PERIOD;}
export function trafficState(t:number){const phase=signalPhase(t);const eastWest:SignalAspect=phase<42?'green':phase<46?'amber':'red';const northSouth:SignalAspect=phase>=60&&phase<102?'green':phase>=102&&phase<106?'amber':'red';return{phase,eastWest,northSouth,pedestrianNorthSouth:phase>=64&&phase<98,pedestrianEastWest:phase>=4&&phase<38};}
export interface TrafficRoute {axis:'eastWest'|'northSouth';direction:1|-1;queue:number;speed:number;extent?:number;cable?:boolean}
/** Disjoint queues wait behind the first stop line. Release gaps retain spacing;
 * traversal of the second intersection occurs within the same green window.
 * Return wrap occurs beyond the delivered central streetscape, not at a junction. */
export function trafficMotion(t:number,route:TrafficRoute){
 const {axis,direction,queue,speed}=route,extent=route.extent??230;
 const stopDistance=axis==='eastWest'?87:route.cable?69.5:65;
 const start=-stopDistance-queue*6.3;
 const elapsed=signalPhase(t-(axis==='northSouth'?60:0)-queue*1.7);
 const flight=(extent-start)/speed,approach=(start+extent)/speed;
 let along:number,waiting=false;
 if(elapsed<flight)along=start+elapsed*speed;
 else if(elapsed<flight+approach)along=-extent+(elapsed-flight)*speed;
 else{along=start;waiting=true;}
 return{coordinate:along*direction,waiting,phase:elapsed,centerStop:start*direction,stopLine:(axis==='eastWest'?84.5:62.5)*-direction,axis,direction,speed:waiting?0:speed};
}

/** Two pedestrians cross Post along existing corner paths. One trip each cycle;
 * direction reverses next cycle, so there is no position reset at either curb. */
export function pedestrianCrossingMotion(t:number,index:number){
 const cycle=Math.floor(t/SIGNAL_PERIOD),phase=signalPhase(t),start=64+index*3,duration=20/1.05;
 const fraction=Math.max(0,Math.min(1,(phase-start)/duration)),northbound=((cycle%2)+2)%2===0;
 return{x:index===0?-67:67,z:northbound?-43-20*fraction:-63+20*fraction,walking:phase>=start&&phase<start+duration,yaw:northbound?Math.PI:0,phase,progress:fraction};
}
