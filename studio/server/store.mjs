import fs from 'node:fs/promises'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProject } from '../schemas/project.mjs';
// path.resolve normalizes separators (the env var is often set with forward slashes, even
// on Windows) so the static-file safety check in server/index.mjs (`file.startsWith(root +
// path.sep)`) compares two paths in the same separator style instead of always failing.
export const PROJECTS_DIR = path.resolve(process.env.STUDIO_PROJECTS || fileURLToPath(new URL('../projects', import.meta.url)));
// A project id becomes a directory name under PROJECTS_DIR and is joined with `shots/`,
// `refs/`, `jobs/` and `export/` all over the server, so it is validated here, at the one
// place every one of those paths is built. `createProject` mints a UUID slice, which fits;
// anything else (`../../escaped_here`, an absolute path, an empty string) is refused rather
// than resolved.
const PROJECT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const projectDir = (id) => {
  if (typeof id !== 'string' || !PROJECT_ID_RE.test(id)) throw new Error(`invalid project id: ${JSON.stringify(id)}`);
  return path.join(PROJECTS_DIR, id);
};
export async function listProjects() {
  await fs.mkdir(PROJECTS_DIR, { recursive: true }); const out = [];
  for (const d of await fs.readdir(PROJECTS_DIR)) { try { out.push(JSON.parse(await fs.readFile(path.join(PROJECTS_DIR, d, 'project.json'), 'utf8'))); } catch { /* skip */ } }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
export async function readProject(id) { return JSON.parse(await fs.readFile(path.join(projectDir(id), 'project.json'), 'utf8')); }
export async function writeProject(p) {
  const errs = validateProject(p); if (errs.length) throw new Error(`invalid project: ${errs.join('; ')}`);
  const dir = projectDir(p.id); await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, 'project.json.tmp'); await fs.writeFile(tmp, JSON.stringify(p, null, 2)); await fs.rename(tmp, path.join(dir, 'project.json')); return p;
}
