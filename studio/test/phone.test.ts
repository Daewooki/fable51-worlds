import { it, expect } from 'vitest';
import { quatToLook, integrate } from '../app/src/phone';

it('identity quaternion looks down -Z', () => {
  const d = quatToLook([0, 0, 0, 1]);
  expect(d[2]).toBeCloseTo(-1);
});

it('integrate moves the eye along the look direction by dolly*speed*dt', () => {
  const s = integrate({ eye: [0, 1.7, 0] }, [0, 0, -1], 1, 0.5, 3);
  expect(s.eye[2]).toBeCloseTo(-1.5);
});
