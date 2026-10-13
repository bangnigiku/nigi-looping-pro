import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { probeMedia } from '../../src/main/services/ffprobe.service';

describe('ffprobe media inspection integration', () => {
  const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures');

  it('inspects MP4 file with spaces in filename correctly', async () => {
    const fileWithSpaces = path.join(fixturesDir, 'sample with spaces.mp4');
    const metadata = await probeMedia(fileWithSpaces);

    expect(metadata.hasVideo).toBe(true);
    expect(metadata.hasAudio).toBe(true);
    expect(metadata.width).toBe(1280);
    expect(metadata.height).toBe(720);
    expect(metadata.durationMs).toBeGreaterThanOrEqual(4900);
    expect(metadata.durationMs).toBeLessThanOrEqual(5200);
  });

  it('inspects MP3 audio file correctly', async () => {
    const audioPath = path.join(fixturesDir, 'ambient_audio.mp3');
    const metadata = await probeMedia(audioPath);

    expect(metadata.hasVideo).toBe(false);
    expect(metadata.hasAudio).toBe(true);
    expect(metadata.durationMs).toBeGreaterThanOrEqual(5800);
  });
});
