// Authored cameras. Their positions are independent from the navigation route;
// photographic viewpoints may be elevated, but walking always uses terrain.
export function createHeroes(heightAt,world=null){
 const h=(id,name,x,z,tx,tz,opts={})=>({id,name,pos:[x,opts.y??heightAt(x,z)+1.68,z],target:[tx,opts.ty??heightAt(tx,tz)+2.6,tz],fov:opts.fov??52});
 const pottery=(world?.interactables||[]).filter(i=>i.kind==='pottery').sort((a,b)=>Math.hypot(a.position.x-225,a.position.z-205)-Math.hypot(b.position.x-225,b.position.z-205))[0]?.position||{x:223.85,y:19.63,z:207.05};
 return [
 h('gion-opening','Gion, before the day begins',12,0,64,0,{fov:54}),
 h('hanamikoji-north','The Hanamikoji lanterns',69,5,67,50,{fov:52}),
 h('hanamikoji-lattice','Timber and lattice',69,22,65,35,{fov:50}),
 h('gion-alley','A turn into Gion',70,55,107,55,{fov:53}),
 h('gion-bicycle','The bicycle in the lane',99,55,107,52,{fov:48}),
 h('shijo-east','Toward the vermilion gate',121,0,149,5,{ty:9,fov:52}),
 h('yasaka-gate','Yasaka west gate',131,3,149,5,{ty:9,fov:52}),
 h('yasaka-oblique','The shrine in spring',140,17,151,5,{ty:8,fov:56}),
 h('yasaka-court','The lantern court',162,25,176,14,{ty:6.8,fov:54}),
 h('yasaka-honden','A quiet wish',163,10,176,-3,{ty:7.8,fov:57}),
 h('maruyama-blossom','Under the Maruyama blossoms',203.7,35.8,208,47.3,{ty:7.7,fov:61}),
 h('maruyama-garden','The garden path',210.9,51.3,205.4,47.3,{ty:heightAt(205.4,47.3)+.9,fov:62}),
 h('nene-north','Nene-no-michi',201,70,201,112,{fov:52}),
 h('nene-walls','A garden beyond the wall',201,94,202,122,{fov:50}),
 h('ishibe-alley','Ishibe-kōji',187.5,100,183.3,107.7,{ty:9.1,fov:57}),
 h('kodaiji-edge','The temple walls',203,130,215,157,{fov:52}),
 h('pagoda-glimpse','Five roofs above the town',222,172,185,182,{ty:25,fov:53}),
 h('pagoda-classic','Yasaka-dōri',220.5,177.5,185,183,{ty:20.6,fov:56}),
 h('pagoda-close','The Yasaka Pagoda',201,175,185,182,{ty:24,fov:58}),
 h('pagoda-reverse','A lane below the pagoda',171,174,195,178,{ty:18,fov:55}),
 h('ninenzaka-lower','Ninenzaka',225,179,225,197,{ty:18,fov:53}),
 h('ninenzaka-shop','Incense on the steps',226.2,204.5,pottery.x-.3,pottery.z+1,{ty:pottery.y+.6,fov:62}),
 h('ninenzaka-steps','The Ninenzaka steps',225,188,225,202,{ty:19,fov:52}),
 h('ninenzaka-reverse','Looking back from Ninenzaka',226,205,225,183,{ty:16.2,fov:53}),
 h('sannenzaka-lower','Sannenzaka in bloom',228,218,226,244,{ty:28,fov:54}),
 h('sannenzaka-steps','A little closer to the sky',227,232,226,249,{ty:28.5,fov:53}),
 h('sannenzaka-reverse','A thousand roofs below',226,249,228,218,{ty:21,fov:54}),
 h('kiyomizuzaka','Tea and temple roofs',251,259,285,275,{ty:41,fov:54}),
 h('kiyomizu-gate','The Nio-mon gate',278,271,295,279,{ty:47,fov:58}),
 h('kiyomizu-precinct','The final approach',325.2,309,342,294,{y:45.68,ty:49.5,fov:66}),
 h('kiyomizu-stage','A forest of timber',371,333,339,299,{y:43,ty:45,fov:56}),
 h('kyoto-overlook','Kyoto, unhurried',325,309,75,354,{y:48.5,ty:15,fov:60}),
 h('kiyomizu-veranda','The wooden veranda',329,303,347,298,{y:45.68,ty:47,fov:60}),
 h('pagoda-postcard','An afternoon postcard',202,192,185,182,{ty:25,fov:60}),
 ];
}
