import { it, expect } from 'vitest';
import { esc } from '../app/src/dom';

it('escapes markup so it cannot be interpreted as HTML', () => {
  const out = esc('<img src=x onerror=1>');
  expect(out).not.toContain('<');
  expect(out).not.toContain('>');
});
it('escapes double quotes', () => { expect(esc('"')).toBe('&quot;'); });
it('escapes single quotes', () => { expect(esc("'")).toBe('&#39;'); });
it('escapes ampersands', () => { expect(esc('&')).toBe('&amp;'); });
it('coerces non-string input without throwing', () => {
  expect(() => esc(42)).not.toThrow();
  expect(esc(42)).toBe('42');
  expect(() => esc(undefined)).not.toThrow();
  expect(esc(undefined)).toBe('');
});
