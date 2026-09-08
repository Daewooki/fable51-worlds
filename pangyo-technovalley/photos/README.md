# Reference photos (not committed)

`src/data/recon/viewpoints.json` defines four camera positions in the world's local frame
(and the WGS84 lat/lon they came from). To compare the model against reality, drop your own
capture for a viewpoint here as `<viewpoint id>.jpg` and set that viewpoint's `photo` field to
`{ "file": "photos/<id>.jpg", "sourceUrl": "…", "author": "…", "license": "…" }`:

| id | what to capture |
|---|---|
| `nc-entrance` | Standing ~44 m south of the NCSOFT R&D Center, looking grid-north at the curtain wall and the rooftop sign. |
| `nc-aerial` | 140 m up, 224 m SSE of the NC building — a drone/aerial frame, or leave empty (this one is a previz framing reference). |
| `pangyoro-hsquare` | East sidewalk of 판교역로 at the H스퀘어 bus stop, looking southbound. |
| `pangyoyeok-plaza` | 판교역 forecourt, ~57 m NW of the station, looking south-east at the 신분당선 entrance canopies. |

Everything in this directory except this README is git-ignored on purpose: Kakao/Naver road-view
frames are **not** redistributable, so they must not be committed. Screenshots produced by
`node tools/qa/qa_report.mjs` go to `docs/qa/`, not here.
