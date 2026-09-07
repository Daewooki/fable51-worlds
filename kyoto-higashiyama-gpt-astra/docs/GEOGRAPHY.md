# Geographic reconstruction notes

Research date: 2026-09-04. This world is an authored, compressed reconstruction, not a survey or navigational map. Runtime architecture is procedural. Reference photographs were inspected as local research inputs and are not used as façade textures. The public evaluation package excludes `docs/reference-images/`; the [reference ledger](REFERENCES.md) links to the original image URLs or source pages and identifies the historical filenames mentioned in reviews.

## Coordinate contract

Implemented origin: Gion-Shijo edge, approximately 35.0038 N, 135.77259 E. Local +X is east; +Z is south; +Y is elevation. At this latitude use 91,000 meters per degree longitude and 111,000 per degree latitude. A uniform horizontal compression of 0.30 preserves the landmark topology while allowing a dense continuous pedestrian experience. Doors, steps and shops retain human scale. The table gives compressed map anchors; final landmark centers can shift by several metres to preserve passages. Consult `src/world/route.js`, `src/world/index.js` and `src/world/terrain.js` for authoritative placement and surfaces.

| Anchor | Latitude | Longitude | Compressed map X,Z | Confidence |
|---|---:|---:|---|---|
| Hanamikoji south section center |35.0026525|135.7748509|62,38|OSM way 27908626 center|
| Yasaka precinct center |35.0034854|135.778387|158,10|OSM way 328903218 center, not gate|
| Nene-no-michi stone notice |35.0005286|135.77995|201,109|OSM node 6222343039|
| Hokanji precinct |34.9985414|135.7793482|185,175|OSM way 371717423 center|
| Ninenzaka pedestrian section |34.9984475|135.780834|225,178|OSM way 30913263 center|
| Ninenzaka steps |34.998092|135.7808329|225,190|OSM way 30882783 center|
| Sannenzaka pedestrian section |34.9972359|135.7809338|228,219|OSM way 526198271 center|
| Sannenzaka steps |34.9963416|135.7808762|226,248|OSM way 179116810 center|
| Kiyomizu Nio Gate |34.9954283|135.7833386|294,279|OSM way 102164608 center|
| Kiyomizu main-hall vicinity |34.99500|135.78500|339,293|General published coordinate; not surveyed footprint|

OSM data retrieved from `https://overpass-api.de/api/interpreter` using a bounding-box query for named roads and landmarks. The [raw OSM response](osm-landmarks.json) is retained in the package. Attribution: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL. OSM supplies street names, orientation, map centers and selected widths. No OSM building meshes are imported into the runtime.

Implemented hero origins: Yasaka west gate [149, 3.3, 5], Hokanji [185, 9.5, 182], Nio Gate [295, 38, 279], Kiyomizu hall/stage [339, 44, 298]. The 7 m south shift of Hokanji keeps Yasaka-dori on its north edge; the hall origin is a procedural deck origin, not the map centroid.

## Continuous walking topology

Start west of Hanamikoji near the Gion-Shijo edge. Head east along Shijo, then south on Hanamikoji and explore a connected eastward side lane. Return north/east to Yasaka's western approach. The west gate faces Shijo; do not place a torii as a replacement for this gate. Within the precinct the main formal axis runs south gate → Buden lantern stage → Honden to the north. Exit toward Maruyama on the east side, then turn south along the temple-edge route to Nene-no-michi.

Nene runs approximately north/south, west of Kodaiji. Hokanji is south and slightly west of Nene; its west-side and east-side streets form a local loop. The classic Yasaka-dori view is from the higher east side looking downhill west toward the pagoda. Thus visiting the pagoda before climbing Ninenzaka requires a short westward detour, then returning east/northeast into Ninenzaka. Ninenzaka runs mainly south, then Sannenzaka continues south with the stronger stair flight near its southern end. Kiyomizuzaka turns east and rises toward Kiyomizu's Nio Gate. The main hall is farther east, and its stage projects south into the wooded valley. Kyoto's basin panorama is westward.

Official continuity references: [Kyoto City's access route](https://kyoto.travel/en/getting-around/comfortable-access-to-higashiyama-kiyomizu-dera-temple/), [official dawn walk](https://kyoto.travel/en/itineraries/higashiyama-at-dawn/), [official crowd-avoidance route](https://kyoto.travel/en/travel-inspiration/how-to-avoid-the-crowds-while-accessing-kiyomizu-temple-and-higashiyama-areas/).

## Grade and scale

OSM tags identify the Ninenzaka flight as 17 steps and 4 m wide and the Sannenzaka flight as 46 steps and 4 m wide. Treat these as volunteered map data, not laser measurements. Both climb toward the south along the walking route. Step heights should remain around 0.15–0.18 m; treads around 0.35–0.48 m. Horizontal distance compression must not compress doors or stairs into unusable scale.

No authoritative DEM was acquired. Relative elevation is inferred from photographed stairs, hillside character and route sequence. Suggested authored surface above start: Gion 0; Yasaka terrace 4; Nene 10; Hokanji 8–11; Ninenzaka 12–16; Sannenzaka 18–26; Nio approach 35–40; Kiyomizu terrace 42–45. These are game-space estimates, not elevations above sea level. Stage supports descend about 13 m below the timber deck, within the valley rather than into a flat plateau. All placement and movement must query the shared terrain and terrace surface implementation.

## Architectural observations

Hanamikoji has long horizontal roof ridges parallel to frontage, low second floors, red-brown or muted ochre plaster, dark lattice, bamboo blinds and restrained red lanterns. Side streets include modern utilities; do not turn the district into a historical park. The hill streets have lighter plaster upstairs, larger merchant openings, goods under deep eaves, stone drainage and foundations terraced to slope. Rooflines follow stepped foundations; buildings themselves remain vertical.

Yasaka west gate: vermilion columns, white infill, green lattice doors, a gabled roof and lower wing corridors. The central Buden is dark timber with a wide hip-and-gable roof and multiple orderly rows of cream lanterns. Honden behind is saturated orange/red beneath a broad brown roof. [Official precinct structures](https://www.yasaka-jinja.or.jp/about/sightseeing_spot/) and [official plan](https://www.yasaka-jinja.or.jp/access/).

Hokanji: five diminishing square tiers; deep broad eaves; pale grey roof edges with gentle corner lift; dark brackets and timber; no bright red structure. A long central finial is essential to silhouette. Lower roof levels are partly occluded from iconic street views. [Gion association landmark](https://www.gion.or.jp/tenkei/%E5%85%AB%E5%9D%82%E3%81%AE%E5%A1%94).

Kiyomizu: Nio Gate is a two-level vermilion structure on a substantial stair platform. Official measurements are approximately 10 m wide, 5 m deep, 14 m high. The main hall is broad and dark with an expansive hipped brown roof, shallow bright edge trim and distinct projecting gables. The stage is a real horizontal timber deck over a dense column/beam grid. The opposite Okuno-in-side view should show the stage, supports, green ravine and basin beyond. [Temple's official map and photographs](https://www.kiyomizudera.or.jp/en/visit/).

## Uncertainties and limitations

Google Earth and interactive Google Street View were not inspected. There are no imported proprietary meshes or photographic runtime textures. Aerial inference is based on OSM map data and official precinct plans; exact lot boundaries, individual businesses and absolute altitude are uncertain. Shop names and displays are authored composites, not a claim about current tenants. The panorama is stylized. Shrine and temple grounds are compressed, with simplified visitor-access areas. These limitations must remain explicit in the final QA report.
