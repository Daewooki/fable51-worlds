import './style.css';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {Pipeline} from './core/post.js';
import {setOutlineResolution} from './core/outline.js';
import {buildSky} from './core/sky.js';
import {createHeroes} from './core/heroes.js';
import {buildWorld} from './world/index.js';
import {ROUTE, ROUTE_LENGTH} from './world/route.js';

const canvas = document.querySelector('#world');
const loading = document.querySelector('#loading');
const viewSelect = document.querySelector('#viewpoint');
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance',preserveDrawingBuffer:true,stencil:false});}
catch(e){loading.textContent='Enable graphics acceleration to view Kyoto.';throw e;}
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
const scene=new THREE.Scene();scene.background=new THREE.Color(0xd8e2da);scene.fog=new THREE.Fog(0xd7dcce,72,360);
const camera=new THREE.PerspectiveCamera(54,innerWidth/innerHeight,.2,1500);camera.rotation.order='YXZ';
const sun=new THREE.DirectionalLight(0xffe1b6,2.0);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-36,right:36,top:36,bottom:-36,near:1,far:210});sun.shadow.bias=-.0004;sun.shadow.normalBias=.035;scene.add(sun,sun.target);
const fill=new THREE.DirectionalLight(0xbecedb,1.03);fill.position.set(48,28,-44);scene.add(fill);
const bounce=new THREE.DirectionalLight(0xdcc9e3,.32);bounce.position.set(10,-18,40);scene.add(bounce);
const hemi=new THREE.HemisphereLight(0xe9eee0,0x998aa5,1.10);scene.add(hemi);
const sky=buildSky(scene);
// Let fonts settle before procedural Canvas2D lettering is drawn.
await Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,1200))]);
const world=buildWorld(scene);const pipeline=new Pipeline(renderer,scene,camera,{pixelBudget:2.4e6});
// Kyoto's softer pencil edge stays legible among timber and ceramic roof relief.
pipeline.ink.mat.uniforms.uStrength.value=.52;pipeline.ink.mat.uniforms.uFadeStart.value=32;pipeline.ink.mat.uniforms.uFadeEnd.value=100;pipeline.grade.mat.uniforms.uSaturation.value=1.035;pipeline.grade.mat.uniforms.uVignette.value=.055;pipeline.grade.mat.uniforms.uLift.value=.018;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = .08;
controls.rotateSpeed = .65;
controls.zoomSpeed = .85;
controls.minDistance = 2;
controls.maxDistance = 1100;
controls.maxPolarAngle = Math.PI / 2 - .025;
controls.screenSpacePanning = true;
controls.listenToKeyEvents(canvas);

const views = [
  {id:'pagoda', name:'Yasaka Pagoda', pos:[233,44,215], target:[189,19,182], fov:48},
  {id:'gion', name:'Gion / Hanamikoji', pos:[101,30,69], target:[68,3,29], fov:50},
  {id:'yasaka', name:'Yasaka Shrine', pos:[127,42,47], target:[168,8,5], fov:50},
  {id:'ninenzaka', name:'Ninenzaka / Sannenzaka', pos:[256,43,229], target:[225,20,212], fov:50},
  {id:'kiyomizu', name:'Kiyomizu-dera', pos:[380,81,350], target:[339,46,298], fov:50},
  {id:'all', name:'Entire scene', pos:[480,330,510], target:[190,18,158], fov:50},
];
const heroes = createHeroes(world.heightAt, world);
let currentView = 'pagoda', mode = 'viewer', elapsed = 0;
let resizeOverride = false, lastFrame = performance.now(), fpsFrames = [];
let shadowX = Infinity, shadowZ = Infinity;

function resize(w = innerWidth, h = innerHeight) {
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  pipeline.setSize(w, h);
  setOutlineResolution(pipeline.size.x, pipeline.size.y);
}
window.addEventListener('resize', () => { if (!resizeOverride) resize(); });
resize();

function setPose(pose) {
  if (pose.pos) camera.position.fromArray(pose.pos);
  if (pose.target) {
    controls.target.fromArray(pose.target);
    camera.lookAt(controls.target);
  } else if (pose.yaw !== undefined) {
    camera.rotation.set(pose.pitch || 0, pose.yaw, 0, 'YXZ');
    controls.target.copy(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(15).add(camera.position));
  }
  camera.fov = pose.fov || 50;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

function resumeViewer() {
  mode = 'viewer';
  controls.enabled = true;
  if (resizeOverride) { resizeOverride = false; resize(); }
}

function showView(id = currentView) {
  const view = views.find(v => v.id === id) || views[0];
  // Flush pending inertia before setting a new orbit center.
  controls.enableDamping = false;
  controls.update();
  setPose(view);
  controls.update();
  controls.enableDamping = true;
  currentView = view.id;
  viewSelect.value = view.id;
  resumeViewer();
}
for (const view of views) {
  const option = new Option(view.name, view.id);
  viewSelect.add(option);
}
viewSelect.addEventListener('change', () => showView(viewSelect.value));
document.querySelector('#reset').addEventListener('click', () => showView());
canvas.addEventListener('pointerdown', () => { canvas.focus({preventScroll:true}); resumeViewer(); });
canvas.addEventListener('wheel', resumeViewer, {passive:true});
canvas.addEventListener('contextmenu', e => e.preventDefault());

const fullscreen = document.querySelector('#fullscreen');
if (!document.documentElement.requestFullscreen) fullscreen.hidden = true;
fullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { /* Fullscreen may be unavailable inside an embedded viewer. */ }
});
document.addEventListener('fullscreenchange', () => {
  fullscreen.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
  fullscreen.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
});
window.addEventListener('keydown', e => {
  if (e.target.closest('select, button, input') || e.repeat) return;
  if (e.code === 'KeyR') showView();
  if (e.code === 'KeyO') pipeline.enabled.ink = !pipeline.enabled.ink;
  if (e.code === 'KeyG') pipeline.enabled.grade = !pipeline.enabled.grade;
});

function lighting() {
  const center = mode === 'viewer' ? controls.target : camera.position;
  const x = Math.round(center.x / 2) * 2, z = Math.round(center.z / 2) * 2;
  if (x !== shadowX || z !== shadowZ) {
    shadowX = x; shadowZ = z;
    const y = world.heightAt(x, z);
    sun.target.position.set(x, y, z);
    sun.position.set(x - 52, y + 68, z + 48);
    renderer.shadowMap.needsUpdate = true;
  }
  // Pull atmospheric haze back when fitting the complete model in the viewer.
  const zoom = mode === 'viewer' ? Math.max(0, camera.position.distanceTo(controls.target) - 80) : 0;
  scene.fog.near = 72 + zoom * .7;
  scene.fog.far = 360 + zoom * 1.8;
}
function renderFrame() {
  lighting();
  sky.update(camera);
  pipeline.render();
}
function frame(now) {
  const raw = (now - lastFrame) / 1000, dt = Math.min(.05, raw);
  lastFrame = now; elapsed += dt;
  if (raw > 0) fpsFrames.push(raw);
  if (fpsFrames.length > 600) fpsFrames.shift();
  if (mode === 'viewer') controls.update();
  world.update(dt, camera, elapsed);
  renderFrame();
  requestAnimationFrame(frame);
}
function getStats() {
  const sorted = [...fpsFrames].sort((a,b) => b-a);
  const avg = fpsFrames.reduce((a,b) => a+b, 0) / (fpsFrames.length || 1);
  const low = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * .01)));
  let meshes = 0, instances = 0, triangles = 0, casters = 0;
  scene.traverse(o => {
    if (!o.isMesh) return;
    meshes++;
    if (o.isInstancedMesh) instances++;
    triangles += (o.geometry.index?.count || o.geometry.attributes.position?.count || 0) / 3 * (o.isInstancedMesh ? o.count : 1);
    if (o.castShadow) casters++;
  });
  return {...world.stats, heroViews:heroes.length, routeLength:ROUTE_LENGTH,
    averageFPS:avg ? 1/avg : 0,
    onePercentLow:low.length ? low.length/low.reduce((a,b) => a+b, 0) : 0,
    drawCalls:renderer.info.render.calls, submittedTriangles:renderer.info.render.triangles,
    worldTriangles:triangles, meshCount:meshes, instancedMeshes:instances,
    shadowCasters:casters, textures:renderer.info.memory.textures,
    geometries:renderer.info.memory.geometries, pipeline:pipeline.stats,
    renderSize:pipeline.size.toArray()};
}

// Keep source inspection and original hero-capture tooling available without UI.
window.__shot = async (name='kyoto', w=1600, h=900, pose={}) => {
  mode = 'qa'; controls.enabled = false; resizeOverride = true;
  const preset = heroes.find(v => v.id === name) || views.find(v => v.id === name);
  setPose({...preset, ...pose});
  resize(w, h);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  renderFrame();
  return {name, dataURL:canvas.toDataURL('image/png'), metrics:getStats(),
    pose:{pos:camera.position.toArray(), yaw:camera.rotation.y, pitch:camera.rotation.x}};
};
window.__kyoto = {camera, controls, world, heroes, views, pipeline, renderer, scene,
  stats:getStats, renderFrame, showView, goTo:showView,
  showHero(index) { return window.__shot(heroes[index % heroes.length].id); },
  route:ROUTE, routeLength:ROUTE_LENGTH,
  get mode() { return mode; },
  setMode(value) { if (value === 'viewer') resumeViewer(); else { mode='qa'; controls.enabled=false; } },
  resetMetrics() { fpsFrames=[]; lastFrame=performance.now(); }
};
showView('pagoda');
renderFrame();
loading.hidden = true;
document.documentElement.dataset.ready = 'true';
requestAnimationFrame(frame);
