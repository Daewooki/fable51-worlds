import fs from 'node:fs/promises'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProject } from '../schemas/project.mjs';
export const PROJECTS_DIR = process.env.STUDIO_PROJECTS || fileURLToPath(new URL('../projects', import.meta.url));
export const projectDir = (id) => path.join(PROJECTS_DIR, id);
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
