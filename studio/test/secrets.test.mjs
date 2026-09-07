import { it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-'));
process.env.STUDIO_SECRETS = path.join(dir, 'secrets.json');
const { readSecrets, writeSecrets, getKey, keySource, keyStatus, mask, defaultProvider, SECRETS_PATH } = await import('../server/secrets.mjs');

const ENV = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'VARCO_API_KEY', 'STUDIO_LLM'];
beforeEach(() => { for (const k of ENV) delete process.env[k]; fs.rmSync(SECRETS_PATH, { force: true }); });
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

it('reads an empty object when the file is missing or corrupt', () => {
  expect(readSecrets()).toEqual({});
  fs.writeFileSync(SECRETS_PATH, '{not json');
  expect(readSecrets()).toEqual({});
});

it('writes, merges, masks and deletes keys', () => {
  writeSecrets({ ANTHROPIC_API_KEY: 'sk-ant-abcdef1234' });
  writeSecrets({ OPENAI_API_KEY: ' sk-openai-9999 ' });
  expect(readSecrets()).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-abcdef1234', OPENAI_API_KEY: 'sk-openai-9999' });
  expect(keyStatus().ANTHROPIC_API_KEY).toEqual({ set: true, source: 'file', masked: '••••1234' });
  writeSecrets({ ANTHROPIC_API_KEY: '' });
  expect(readSecrets()).toEqual({ OPENAI_API_KEY: 'sk-openai-9999' });
  expect(keySource('ANTHROPIC_API_KEY')).toBe('none');
  expect(mask('')).toBe('');
});

it('rejects unknown names and bad values', () => {
  expect(() => writeSecrets({ NOT_A_KEY: 'x' })).toThrow(/unknown key/);
  expect(() => writeSecrets({ VARCO_API_KEY: 42 })).toThrow(/string/);
  expect(() => writeSecrets({ VARCO_API_KEY: 'two\nlines' })).toThrow(/single-line/);
  expect(() => writeSecrets({ VARCO_API_KEY: 'x'.repeat(513) })).toThrow(/512/);
});

it('environment variables win over the file', () => {
  writeSecrets({ ANTHROPIC_API_KEY: 'from-file' });
  expect(getKey('ANTHROPIC_API_KEY')).toBe('from-file');
  process.env.ANTHROPIC_API_KEY = 'from-env';
  expect(getKey('ANTHROPIC_API_KEY')).toBe('from-env');
  expect(keySource('ANTHROPIC_API_KEY')).toBe('env');
});

it('defaultProvider follows STUDIO_LLM, then the first key, then none', () => {
  expect(defaultProvider()).toBe('none');
  writeSecrets({ OPENAI_API_KEY: 'k' });
  expect(defaultProvider()).toBe('openai');
  writeSecrets({ ANTHROPIC_API_KEY: 'k' });
  expect(defaultProvider()).toBe('anthropic');
  process.env.STUDIO_LLM = 'openai';
  expect(defaultProvider()).toBe('openai');
});
