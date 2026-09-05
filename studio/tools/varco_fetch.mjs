// VARCO 3D image-to-3D via the VARCO API Platform when VARCO_API_KEY is set; otherwise prints the manual path.
import fs from 'node:fs';
const argv = process.argv.slice(2); const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const image = opt('image'), name = opt('name', 'asset'), out = opt('out', `${name}.glb`);
const KEY = process.env.VARCO_API_KEY, BASE = process.env.VARCO_API_BASE || 'https://api.varco.ai';
if (!image) { console.error('usage: node tools/varco_fetch.mjs --image ref.png --name my_prop [--out my_prop.glb]'); process.exit(1); }
if (!KEY) {
  console.log(`VARCO_API_KEY not set. Manual path:\n 1) open https://3d.varco.ai and generate from ${image} (or a VARCO Art render)\n 2) Export -> GLB (auto remesh ~5k tris, keep PBR)\n 3) node tools/inject_asset.mjs ${out} --as varco/${name} --height <metres> [--replace <rel>]`);
  process.exit(0);
}
// Endpoint shape per VARCO API Platform (confirm against api.varco.ai docs; NC AI internal access): POST /v1/image-to-3d (multipart) -> {job_id}; GET /v1/jobs/{id} -> {status, result:{glb_url}}
const form = new FormData(); form.append('image', new Blob([fs.readFileSync(image)]), 'ref.png'); form.append('output_format', 'glb');
const start = await fetch(`${BASE}/v1/image-to-3d`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: form }); if (!start.ok) { console.error('VARCO start failed', start.status, await start.text()); process.exit(1); }
const { job_id } = await start.json(); let res;
for (let i = 0; i < 120; i++) { await new Promise((r) => setTimeout(r, 5000)); res = await (await fetch(`${BASE}/v1/jobs/${job_id}`, { headers: { Authorization: `Bearer ${KEY}` } })).json(); if (res.status === 'succeeded' || res.status === 'failed') break; process.stdout.write('.'); }
if (res?.status !== 'succeeded') { console.error('\nVARCO job did not succeed', JSON.stringify(res)); process.exit(1); }
// Check the download before writing: without this an expired-URL error page lands on disk
// as a `.glb` and only fails later, inside inject_asset.
const glbRes = await fetch(res.result.glb_url);
if (!glbRes.ok) { console.error(`\nGLB download failed ${glbRes.status} ${glbRes.statusText} — ${res.result.glb_url}`); process.exit(1); }
fs.writeFileSync(out, Buffer.from(await glbRes.arrayBuffer())); console.log('\nsaved', out, '-> next: node tools/inject_asset.mjs', out, '--as varco/' + name, '--height <metres>');
