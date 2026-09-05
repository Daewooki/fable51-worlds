import { describe, it, expect } from 'vitest';
import { createProject, createShot, validateKey, validateShot, validateProject, WORLDS } from '../schemas/project.mjs';

describe('project schema', () => {
  it('creates a project with defaults', () => {
    const p = createProject({ name: 'MV1', world: 'union-square-sf' });
    expect(p.id).toMatch(/^[a-z0-9-]{8,}$/); expect(p.shots).toEqual([]); expect(p.refs).toEqual({ artist: [], style: [] });
  });
  it('rejects unknown worlds', () => expect(() => createProject({ name: 'x', world: 'mars' })).toThrow(/world/));
  it('shot defaults: 30fps 1920x1080 sunset', () => {
    const s = createShot({ name: 'opening' });
    expect([s.fps, s.width, s.height, s.timeOfDay]).toEqual([30, 1920, 1080, 'sunset']); expect(s.keys).toEqual([]);
  });
  it('validateKey flags bad keys', () => {
    expect(validateKey({ t: 0, m: 'air', eye: [0, 1, 2], look: [0, 0, 0] })).toEqual([]);
    expect(validateKey({ t: 0, m: 'walk', look: [0, 0, 0] })).toContain('walk key needs pos [x,z]');
    expect(validateKey({ t: -1, m: 'air', eye: [0, 0, 0], look: [0, 0, 0] })).toContain('t must be >= 0');
  });
  it('validateShot requires monotonic key times', () => {
    const s = createShot({ name: 'a' });
    s.keys = [{ t: 1, m: 'air', eye: [0, 0, 0], look: [0, 0, 0] }, { t: 0.5, m: 'air', eye: [0, 0, 0], look: [0, 0, 0] }];
    expect(validateShot(s)).toContain('keys must be sorted by t');
  });
  it('validateProject aggregates', () => {
    const p = createProject({ name: 'MV1', world: WORLDS[0] }); p.shots.push(createShot({ name: 's' }));
    expect(validateProject(p)).toEqual([]);
  });
});
