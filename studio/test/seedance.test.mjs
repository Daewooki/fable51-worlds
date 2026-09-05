import { describe, it, expect } from 'vitest';
import { buildArgv, jobCardMarkdown } from '../server/finalize/seedance.mjs';
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
