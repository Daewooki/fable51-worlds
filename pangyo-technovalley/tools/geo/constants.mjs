/**
 * constants.mjs — the single source of truth for the Pangyo Techno Valley world frame.
 * Mirrored into src/geo/geo.ts by build_gis.mjs (which also warns/regenerates on drift).
 */

/** WGS84 bounding box of the reconnaissance dataset (≈ 1.28 km N–S × 1.59 km E–W). */
export const BBOX = { south: 37.3950, west: 127.0990, north: 37.4065, east: 127.1170 };

/** Reference latitude for the equirectangular scale factors. */
export const LAT0_DEG = 37.40;

export const D2R = Math.PI / 180;
const phi = LAT0_DEG * D2R;
/** Metres per degree at LAT0 (WGS84 series expansion; geo.ts carries the same numbers). */
export const M_PER_DEG_LAT = 111132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
export const M_PER_DEG_LON = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi) + 0.118 * Math.cos(5 * phi);

/** OSM way of the NCSOFT R&D Center (엔씨소프트R&D센터, building:levels 12, height 58). Its centroid is the origin. */
export const ORIGIN_WAY_ID = 694434545;
/** Used only when the OSM dump lacks ORIGIN_WAY_ID. */
export const FALLBACK_ORIGIN = { lat: 37.39936, lon: 127.10885 };

/** Fallback storey height when only building:levels is tagged (+1 m for the parapet/roof). */
export const LEVEL_HEIGHT_M = 3.6;
/** Keep linear features up to this far outside the bbox. */
export const CLIP_MARGIN_M = 60;
/** Elevation sample spacing. */
export const GRID_SPACING_M = 25;
