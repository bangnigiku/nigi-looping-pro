import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../src/shared/project';
import { buildExportPlan, buildLoopPreviewPlan } from '../../src/shared/render';
import { addClip } from '../../src/shared/timeline';
import type { MediaAsset } from '../../src/shared/types';

describe('glitch and distortion regression tests', () => {
  const dummyAsset: MediaAsset = {
    id: 'asset-video-1',
    name: 'sample.mp4',
    path: 'C:/media/sample.mp4',
    kind: 'video',
    importedAt: new Date().toISOString(),
    metadata: {
      durationMs: 4000,
      formatName: 'mov,mp4',
      sizeBytes: 2048,
      hasVideo: true,
      hasAudio: true,
      width: 1920,
      height: 1080,
      previewLikelyUnsupported: false,
    },
  };

  it('normalizes video PTS before fps filter to prevent initial frame duplication', () => {
    let proj = createEmptyProject();
    proj.assets.push(dummyAsset);
    proj = addClip(proj, dummyAsset.id, 'track-video-1').doc;

    const res = buildExportPlan(proj, { tempDir: 'C:/temp', finalTempPath: 'C:/temp/out.mp4' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const filterArg = res.plan.steps[0]?.args.find((_a, idx, arr) => arr[idx - 1] === '-filter_complex');
    expect(filterArg).toBeDefined();
    // Verify setpts=PTS-STARTPTS occurs before fps= in the video graph
    expect(filterArg).toContain('setpts=PTS-STARTPTS,fps=');
  });

  it('uses intra-only keyframes and no B-frames for intermediate segments', () => {
    let proj = createEmptyProject();
    proj.assets.push(dummyAsset);
    proj = addClip(proj, dummyAsset.id, 'track-video-1').doc;
    proj.settings.loop.enabled = true;
    proj.settings.loop.targetDurationMs = 10000;
    proj.settings.loop.videoCrossfadeMs = 1000;

    const res = buildExportPlan(proj, { tempDir: 'C:/temp', finalTempPath: 'C:/temp/out.mp4' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Step 1: unit.mov
    const unitStep = res.plan.steps[0]!;
    expect(unitStep.stage).toBe('unit');
    expect(unitStep.args).toContain('-g');
    expect(unitStep.args).toContain('1');
    expect(unitStep.args).toContain('-bf');
    expect(unitStep.args).toContain('0');

    // Step 2: segments (head.mov, tile.mov, tail.mov)
    const segStep = res.plan.steps[1]!;
    expect(segStep.stage).toBe('segments');
    expect(segStep.args).toContain('-g');
    expect(segStep.args).toContain('1');
    expect(segStep.args).toContain('-bf');
    expect(segStep.args).toContain('0');
  });

  it('uses robust afade and amix for audio crossfade rather than acrossfade', () => {
    let proj = createEmptyProject();
    proj.assets.push(dummyAsset);
    proj = addClip(proj, dummyAsset.id, 'track-video-1').doc;
    proj.settings.loop.enabled = true;
    proj.settings.loop.targetDurationMs = 10000;
    proj.settings.loop.videoCrossfadeMs = 1000;
    proj.settings.loop.audioCrossfadeEnabled = true;
    proj.settings.loop.audioCrossfadeMs = 1000;

    const res = buildExportPlan(proj, { tempDir: 'C:/temp', finalTempPath: 'C:/temp/out.mp4' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const segStep = res.plan.steps[1]!;
    const filterArg = segStep.args.find((_a, idx, arr) => arr[idx - 1] === '-filter_complex');
    expect(filterArg).toBeDefined();

    // Verify it uses afade and amix, avoiding acrossfade which drops 0-offset streams
    expect(filterArg).toContain('afade=t=out:');
    expect(filterArg).toContain('afade=t=in:');
    expect(filterArg).toContain('amix=inputs=2:');
    expect(filterArg).not.toContain('acrossfade=');
  });

  it('generates loop preview using afade and amix for audio crossfade', () => {
    let proj = createEmptyProject();
    proj.assets.push(dummyAsset);
    proj = addClip(proj, dummyAsset.id, 'track-video-1').doc;
    proj.settings.loop.enabled = true;
    proj.settings.loop.targetDurationMs = 10000;
    proj.settings.loop.videoCrossfadeMs = 1000;
    proj.settings.loop.audioCrossfadeEnabled = true;
    proj.settings.loop.audioCrossfadeMs = 1000;

    const res = buildLoopPreviewPlan(proj, 'C:/temp/prev.mp4', 'C:/temp');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const filterArg = res.plan.args.find((_a, idx, arr) => arr[idx - 1] === '-filter_complex');
    expect(filterArg).toBeDefined();
    expect(filterArg).toContain('afade=t=out:');
    expect(filterArg).toContain('afade=t=in:');
    expect(filterArg).toContain('amix=inputs=2:');
    expect(filterArg).not.toContain('acrossfade=');
  });

  it('preserves full video frame sequence in cut loop (0s video crossfade)', () => {
    let proj = createEmptyProject();
    proj.assets.push(dummyAsset);
    proj = addClip(proj, dummyAsset.id, 'track-video-1').doc;
    proj.settings.loop.enabled = true;
    proj.settings.loop.targetDurationMs = 10000;
    proj.settings.loop.videoCrossfadeMs = 0;
    proj.settings.loop.audioCrossfadeEnabled = true;
    proj.settings.loop.audioCrossfadeMs = 1000;

    const res = buildExportPlan(proj, { tempDir: 'C:/temp', finalTempPath: 'C:/temp/out.mp4' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const segStep = res.plan.steps[1]!;
    const filterArg = segStep.args.find((_a, idx, arr) => arr[idx - 1] === '-filter_complex');
    expect(filterArg).toBeDefined();
    // In cut loop, tile starts with incoming unit from frame 0
    expect(filterArg).toContain('trim=start_frame=0:end_frame=30');
    expect(filterArg).toContain('nullsink');
  });
});
