import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { buildArgv, jobCardMarkdown, extractMp4Url, resolveCli, posixQuote } from '../server/finalize/seedance.mjs';
const files = { previz: 'C:/p/previz.mp4', artist: ['C:/p/a1.png', 'C:/p/a2.png'], style: ['C:/p/s.png'], audio: 'C:/p/track.mp3' };
describe('seedance argv', () => {
  it('video_edit uses previz as the video reference and no images', () => {
    const a = buildArgv({ mode: 'video_edit', prompt: 'neon rain', duration: 5, resolution: '1080p', aspect: '16:9', generateAudio: false, useArtist: true }, files);
    expect(a.slice(0, 3)).toEqual(['generate', 'create', 'seedance_2_5']);
    expect(a).toContain('--mode'); expect(a[a.indexOf('--mode') + 1]).toBe('video_edit');
    expect(a).toContain('--video-references'); expect(a).not.toContain('--image-references');
    expect(a).toContain('--wait'); expect(a).toContain('--json');
  });
  it('omni_reference adds artist + style images and audio', () => {
    const a = buildArgv({ mode: 'omni_reference', prompt: 'p', duration: 8, resolution: '720p', aspect: '9:16', generateAudio: true, useArtist: true, useStyle: true, useAudio: true }, files);
    expect(a.filter((x) => x === '--image-references').length).toBe(3);
    expect(a).toContain('--audio-references'); expect(a[a.indexOf('--aspect_ratio') + 1]).toBe('9:16');
  });
  it('job card lists inputs for manual runs', () => {
    const md = jobCardMarkdown({ mode: 'omni_reference', prompt: 'p', duration: 8, resolution: '720p', aspect: '16:9' }, files);
    expect(md).toContain('seedance_2_5'); expect(md).toContain('previz.mp4'); expect(md).toContain('a1.png');
  });
  it('video_extension keeps duration but drops aspect_ratio', () => {
    const a = buildArgv({ mode: 'video_extension', prompt: 'p', duration: 6, resolution: '1080p', aspect: '16:9', extensionMode: 'forward' }, files);
    expect(a).toContain('--duration'); expect(a[a.indexOf('--duration') + 1]).toBe('6');
    expect(a).toContain('--extension_mode');
    expect(a).not.toContain('--aspect_ratio');
  });
});

describe('extractMp4Url', () => {
  it('parses a single pretty-printed JSON object with result_url', () => {
    const out = `{
  "status": "done",
  "result_url": "https://cdn.example.com/final.mp4"
}`;
    expect(extractMp4Url(out)).toBe('https://cdn.example.com/final.mp4');
  });
  it('prefers the final object when progress objects precede it, including a nested field', () => {
    const out = [
      '{"status":"processing","progress":10}',
      '{"status":"processing","progress":50}',
      '{"status":"done","output":{"video_url":"https://cdn.example.com/final.mp4?sig=abc"}}',
    ].join('\n');
    expect(extractMp4Url(out)).toBe('https://cdn.example.com/final.mp4?sig=abc');
  });
  it('falls back to a loose scan and strips trailing JSON punctuation', () => {
    const out = 'Uploading... done\nResult: "https://cdn.example.com/clip.mp4"}';
    expect(extractMp4Url(out)).toBe('https://cdn.example.com/clip.mp4');
  });
  it('returns undefined when no url is present', () => {
    expect(extractMp4Url('{"status":"processing","progress":50}')).toBeFalsy();
  });
});


describe('resolveCli (no shell anywhere)', () => {
  // The whole point of C1: the CLI is spawned as an absolute path to a native binary with
  // shell:false, so cmd.exe never re-parses the prompt. On this machine `@higgsfield/cli` is
  // installed globally, so the win32 lookup must find `vendor/hf.exe`.
  it.skipIf(process.platform !== 'win32')('resolves the native hf.exe on win32', () => {
    const p = resolveCli();
    expect(typeof p).toBe('string');
    expect(p.endsWith('hf.exe')).toBe(true);
  });
  it('returns a string or null, never a bare command name', () => {
    const p = resolveCli();
    expect(p === null || (typeof p === 'string' && path.isAbsolute(p))).toBe(true);
  });
});

describe('prompt injection is structurally impossible', () => {
  const nasty = 'x" & echo INJECTED %USERNAME%';
  it('buildArgv carries the prompt as one argv element, verbatim', () => {
    const a = buildArgv({ mode: 'video_edit', prompt: nasty, resolution: '1080p' }, files);
    expect(a[a.indexOf('--prompt') + 1]).toBe(nasty);
  });
  it('the job card shows the prompt intact (it is copy/paste documentation, never executed)', () => {
    const md = jobCardMarkdown({ mode: 'video_edit', prompt: nasty, resolution: '1080p', duration: 5, aspect: '16:9' }, files);
    expect(md).toContain(nasty);
  });
  it('the card quotes the command line POSIX-style for a human to paste', () => {
    const md = jobCardMarkdown({ mode: 'video_edit', prompt: nasty, resolution: '1080p', duration: 5, aspect: '16:9' }, files);
    expect(md).toContain(`'x" & echo INJECTED %USERNAME%'`);
    expect(posixQuote("it's")).toBe("'it'\\''s'");
  });
});

describe('mode validation', () => {
  it('rejects a mode outside the four Seedance modes', () => {
    expect(() => buildArgv({ mode: 'sneaky', prompt: 'p' }, files)).toThrow(/unknown seedance mode/);
  });
});
