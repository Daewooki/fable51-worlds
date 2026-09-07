/** East +X, south +Z. 0,0 is Gion-Shijo at 35.0038 N / 135.77259 E.
 * Horizontal distances are deliberately compressed ~0.30; buildings keep metric scale.
 * Heights are authored relative estimates, not a surveyed elevation model. */
export const DISTRICTS = [
 {id:'gion',name:'Gion',jp:'祇園',subtitle:'The city, before the day begins',x:20,z:0,y:0,width:9},
 {id:'hanamikoji',name:'Hanamikoji',jp:'花見小路',subtitle:'Latticework, lanterns, and little discoveries',x:69,z:23,y:0.6,width:7.4},
 {id:'gion-alley',name:'Gion side streets',jp:'祇園町',subtitle:'A quieter turn off the familiar path',x:90,z:55,y:1.1,width:4.4},
 {id:'shijo',name:'Shijō-dōri',jp:'四条通',subtitle:'Following the light toward Yasaka',x:127,z:0,y:1.8,width:10},
 {id:'yasaka-gate',name:'Yasaka Shrine',jp:'八坂神社',subtitle:'A vermilion welcome at the foot of the hills',x:149,z:5,y:3.3,width:11},
 {id:'yasaka-precinct',name:'The lantern court',jp:'舞殿',subtitle:'A wish, folded into a quiet morning',x:166,z:10,y:4,width:14},
 {id:'maruyama',name:'Maruyama gardens',jp:'円山',subtitle:'A breath of spring beneath the blossoms',x:196,z:42,y:5.4,width:6},
 {id:'nene',name:'Nene-no-michi',jp:'ねねの道',subtitle:'Stone walls, bamboo, and a slower rhythm',x:201,z:86,y:8,width:6},
 {id:'ishibe',name:'Ishibe-kōji',jp:'石塀小路',subtitle:'Where the garden walls hold the quiet',x:181,z:100,y:7.2,width:3.5},
 {id:'kodaiji',name:'Kōdai-ji edge',jp:'高台寺',subtitle:'Garden glimpses along the temple wall',x:203,z:134,y:9.8,width:5.4},
 {id:'yasaka-dori',name:'Yasaka-dōri',jp:'八坂通',subtitle:'Five roofs emerge above the town',x:218,z:177,y:13,width:5.8},
 {id:'pagoda',name:'Yasaka Pagoda',jp:'八坂の塔',subtitle:'An old silhouette, a new point of view',x:185,z:175,y:9.5,width:6},
 {id:'ninenzaka',name:'Ninenzaka',jp:'二寧坂',subtitle:'Every little shop has a story',x:225,z:185,y:14.5,width:5.4},
 {id:'ninen-steps',name:'The Ninenzaka steps',jp:'二年坂',subtitle:'Stone by stone, a little closer to the sky',x:225,z:195,y:16.5,width:5},
 {id:'sannenzaka',name:'Sannenzaka',jp:'産寧坂',subtitle:'A winding climb through old Kyoto',x:227,z:234,y:22.8,width:5.4},
 {id:'kiyomizuzaka',name:'Kiyomizuzaka',jp:'清水坂',subtitle:'Tea, pottery, and the temple ahead',x:258,z:261,y:32,width:7.8},
 {id:'niomon',name:'Kiyomizu entrance',jp:'仁王門',subtitle:'The final climb opens into sky',x:295,z:279,y:38,width:12},
 {id:'kiyomizu',name:'Kiyomizu-dera',jp:'清水寺',subtitle:'Held above the trees by a forest of timber',x:339,z:292,y:44,width:13},
 {id:'overlook',name:'The Kyoto overlook',jp:'東山の眺め',subtitle:'Take a moment. You have come a long way.',x:339,z:311,y:44,width:12},
];
export const ROUTE = [[0, 0, 0, 9], [70, 0, 0.3, 9], [67, 55, 1, 7.4], [113, 55, 1.3, 4.4], [113, 0, 1.2, 6], [140, 0, 1.5, 10], [149, 5, 3.3, 11], [165, 7, 3.3, 14], [165, 24, 3.3, 8], [190, 35, 5, 6], [201, 64, 6.8, 6], [201, 105, 9, 6], [203, 140, 10, 5.8], [216, 158, 12, 5.6], [225, 178, 14, 5.6], [225, 188, 14.6, 5.4], [225, 198, 17.3, 4], [228, 219, 19, 5.4], [226, 248, 26.4, 4], [253, 259, 31, 7.8], [279, 271, 36, 8], [295, 279, 38, 12], [312, 279, 42, 12], [318, 300, 44, 11], [339, 303, 44, 12], [339, 310, 44, 12]];
export const SIDE_ROUTES = [[[69, 23, 0.6, 4], [42, 23, 0.35, 4], [42, 0, 0.15, 4]], [[201, 100, 8.7, 3.5], [177, 100, 7.1, 3.5], [177, 115, 7.4, 3.5], [201, 115, 9.3, 3.5]], [[225, 178, 14, 5.8], [202, 175, 11, 5.8], [169, 175, 8.2, 5.8], [120, 175, 5.8, 6.4]], [[202, 175, 11, 4], [202, 192, 10, 4], [185, 196, 9, 4]], [[166, 10, 4, 7], [166, -7, 4, 7]], [[190, 35, 5, 5], [215, 37, 5.6, 5], [217, 58, 6.4, 5], [201, 64, 6.8, 5]], [[312, 279, 42, 7], [305, 296, 42.5, 7], [318, 300, 44, 7], [330, 303, 44, 7]]];
export const ALL_PATHS=[ROUTE,...SIDE_ROUTES];
export const segments=ALL_PATHS.flatMap((p,branch)=>p.slice(1).map((b,i)=>({a:p[i],b,branch,index:i,length:Math.hypot(b[0]-p[i][0],b[1]-p[i][1])})));
export function nearestPath(x,z){let best=null,bd=Infinity;for(const s of segments){const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1];const t=Math.max(0,Math.min(1,((x-s.a[0])*dx+(z-s.a[1])*dz)/(dx*dx+dz*dz)));const px=s.a[0]+dx*t,pz=s.a[1]+dz*t,d=Math.hypot(x-px,z-pz);if(d<bd){bd=d;best={...s,t,d,x:px,z:pz,y:s.a[2]+(s.b[2]-s.a[2])*t,width:s.a[3]+(s.b[3]-s.a[3])*t};}}return best;}
export function districtAt(x,z){return DISTRICTS.reduce((a,b)=>Math.hypot(a.x-x,a.z-z)<Math.hypot(b.x-x,b.z-z)?a:b);}
export function pointOnRoute(distance){for(let i=1;i<ROUTE.length;i++){const a=ROUTE[i-1],b=ROUTE[i],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(distance<=l){const t=distance/l;return {x:a[0]+(b[0]-a[0])*t,z:a[1]+(b[1]-a[1])*t,y:a[2]+(b[2]-a[2])*t,yaw:Math.atan2(-(b[0]-a[0]),-(b[1]-a[1]))};}distance-=l;}return {x:339,z:310,y:44,yaw:Math.PI};}
export const ROUTE_LENGTH=ROUTE.slice(1).reduce((n,b,i)=>n+Math.hypot(b[0]-ROUTE[i][0],b[1]-ROUTE[i][1]),0);
