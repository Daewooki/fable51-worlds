import { it, expect } from 'vitest';
import { quatToLook, integrate, sanitizeCam } from '../app/src/phone';

it('identity quaternion looks down -Z', () => {
  const d = quatToLook([0, 0, 0, 1]);
  expect(d[2]).toBeCloseTo(-1);
});

it('integrate moves the eye along the look direction by dolly*speed*dt', () => {
  const s = integrate({ eye: [0, 1.7, 0] }, [0, 0, -1], 1, 0.5, 3);
  expect(s.eye[2]).toBeCloseTo(-1.5);
});

it('sanitizeCam passes a valid sample through with q normalized', () => {
  const c = sanitizeCam({ q: [0, 0, 0, 2], dolly: 0.5, zoom: 60, ts: 123 });
  expect(c).not.toBeNull();
  expect(c!.q).toEqual([0, 0, 0, 1]);
  expect(c!.dolly).toBe(0.5);
  expect(c!.zoom).toBe(60);
  expect(c!.ts).toBe(123);
});

it('sanitizeCam rejects a q containing NaN', () => {
  expect(sanitizeCam({ q: [0, 0, 0, NaN], dolly: 0, zoom: 60, ts: 1 })).toBeNull();
});

it('sanitizeCam rejects a q of the wrong length', () => {
  expect(sanitizeCam({ q: [0, 0, 1], dolly: 0, zoom: 60, ts: 1 })).toBeNull();
});

it('sanitizeCam clamps an out-of-range dolly to 1', () => {
  const c = sanitizeCam({ q: [0, 0, 0, 1], dolly: 5, zoom: 60, ts: 1 });
  expect(c!.dolly).toBe(1);
});

it('sanitizeCam clamps an out-of-range zoom to 90', () => {
  const c = sanitizeCam({ q: [0, 0, 0, 1], dolly: 0, zoom: 200, ts: 1 });
  expect(c!.zoom).toBe(90);
});

it('sanitizeCam rejects a message with a missing ts', () => {
  expect(sanitizeCam({ q: [0, 0, 0, 1], dolly: 0, zoom: 60 })).toBeNull();
});
