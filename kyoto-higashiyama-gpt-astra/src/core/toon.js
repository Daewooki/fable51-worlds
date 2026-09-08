// Adapted from Sakura Crossing, copyright (c) 2026 Kenton Wang. MIT.
// See THIRD_PARTY_NOTICES.md for the complete license notice.
import * as THREE from 'three';
import { PAL } from './palette.js';

/* ------------------------------------------------------------------ *
 * Cel shading
 *
 * Everything in the scene uses MeshToonMaterial with a hand-authored
 * gradient ramp, so direct sunlight is quantised into 2-4 flat bands
 * instead of a smooth falloff.  On top of that we patch the toon BRDF so
 * the darker bands are *tinted* toward a cool violet rather than simply
 * being a darker version of the base colour -- that hue shift in shadow
 * is most of what separates "anime cel" from "low-poly 3D".
 * ------------------------------------------------------------------ */

const RAMPS = {
  2: [96, 255],
  3: [92, 178, 255],
  4: [80, 142, 202, 255],
  5: [74, 124, 172, 214, 255],
  // high-key ramps: for blossom and other pale masses that must stay light
  // even on the shadow side
  soft: [180, 255],
  soft3: [172, 214, 255],
};

const rampCache = new Map();

export function gradientMap(bands = 3) {
  const key = bands;
  if (rampCache.has(key)) return rampCache.get(key);
  const stops = RAMPS[bands] || RAMPS[3];
  const data = new Uint8Array(stops.length * 4);
  for (let i = 0; i < stops.length; i++) {
    data[i * 4 + 0] = stops[i];
    data[i * 4 + 1] = stops[i];
    data[i * 4 + 2] = stops[i];
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, stops.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  rampCache.set(key, tex);
  return tex;
}

const TOON_CHUNK = 'lights_toon_pars_fragment';
const TOON_LINE =
  'vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;';
const TOON_PATCH = `
	vec3 celBand = getGradientIrradiance( geometryNormal, directLight.direction );
	vec3 irradiance = celBand * mix( uShadowTint, vec3( 1.0 ), celBand ) * directLight.color;`;

let patchAvailable = false;
let patchedChunk = '';
{
  const src = THREE.ShaderChunk[TOON_CHUNK];
  if (src && src.includes(TOON_LINE)) {
    patchedChunk = 'uniform vec3 uShadowTint;\n' + src.replace(TOON_LINE, TOON_PATCH);
    patchAvailable = true;
  }
}

/** Tint the shadow side of a toon material toward a cool hue. */
function applyShadowTint(mat, tint, inkWeight=1) {
  if (!patchAvailable) return mat;
  const uni = { value: new THREE.Color(tint) };
  mat.userData.shadowTint = uni;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uShadowTint = uni;
    shader.fragmentShader = shader.fragmentShader.replace(
      `#include <${TOON_CHUNK}>`,
      patchedChunk
    );
    if(inkWeight<1) {
      // Opaque foliage writes its painted-line weight into the otherwise
      // unused scene-color alpha channel. This is metadata, not blending.
      shader.uniforms.uSurfaceInk={value:inkWeight};
      shader.fragmentShader='uniform float uSurfaceInk;\n'+shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\n gl_FragColor.a = uSurfaceInk;'
      );
    }
  };
  const hex = new THREE.Color(tint).getHexString();
  mat.customProgramCacheKey = () => 'celTint_' + hex + '_ink_' + inkWeight;
  mat.userData.inkWeight=inkWeight;
  return mat;
}

const matCache = new Map();

/**
 * Cel-shaded material factory.  Results are cached by parameter signature so
 * the whole street ends up sharing a few dozen shader programs.
 */
export function cel(opts = {}) {
  const {
    color = 0xffffff,
    bands = 3,
    tint = 0x6c5f8c,
    flat = true,
    map = null,
    emissive = null,
    emissiveIntensity = 1,
    transparent = false,
    opacity = 1,
    side = THREE.FrontSide,
    alphaTest = 0,
    depthWrite = null,
    fog = true,
    alphaMap = null,
    vertexColors = false,
    inkWeight = 1,
    cache = true,
  } = opts;

  const key = cache && !map && !alphaMap
    ? [color, bands, tint, flat, emissive, emissiveIntensity, transparent,
       opacity, side, alphaTest, depthWrite, fog, vertexColors, inkWeight].join('|')
    : null;
  if (key && matCache.has(key)) return matCache.get(key);

  const mat = new THREE.MeshToonMaterial({
    color,
    gradientMap: gradientMap(bands),
    map,
    alphaMap,
    transparent,
    opacity,
    side,
    alphaTest,
    fog,
    vertexColors,
    emissive: emissive === null ? 0x000000 : emissive,
    emissiveIntensity,
  });
  // r180 recognizes flatShading in WebGLPrograms but MeshToonMaterial does
  // not declare the property for setValues; assign after construction.
  mat.flatShading = flat;
  if (depthWrite !== null) mat.depthWrite = depthWrite;
  applyShadowTint(mat, tint, inkWeight);
  if (key) matCache.set(key, mat);
  return mat;
}

const flatCache = new Map();

/** Unlit flat colour -- for sky, distant silhouettes, glowing panels, glass. */
export function flat(opts = {}) {
  const {
    color = 0xffffff,
    map = null,
    transparent = false,
    opacity = 1,
    side = THREE.FrontSide,
    alphaTest = 0,
    depthWrite = null,
    fog = true,
    cache = true,
    toneMapped = true,
  } = opts;
  const key = cache && !map
    ? [color, transparent, opacity, side, alphaTest, depthWrite, fog, toneMapped].join('|')
    : null;
  if (key && flatCache.has(key)) return flatCache.get(key);
  const mat = new THREE.MeshBasicMaterial({
    color, map, transparent, opacity, side, alphaTest, fog, toneMapped,
  });
  if (depthWrite !== null) mat.depthWrite = depthWrite;
  if (key) flatCache.set(key, mat);
  return mat;
}

/** Shared material shorthands used all over the world builders. */
export const MAT = {
  get ink() { return flat({ color: PAL.ink, fog: false }); },
  get glassDark() { return flat({ color: PAL.glassDark }); },
};
