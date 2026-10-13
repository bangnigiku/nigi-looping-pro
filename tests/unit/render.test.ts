import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../src/shared/project';
import { buildExportPlan, buildLoopPreviewPlan } from '../../src/shared/render';
import { addClip } from '../../src/shared/timeline';
import type { MediaAsset } from '../../src/shared/types';

describe('render planner', () => {
  const dummyAsset: MediaAsset = {
    id: 'asset-video-1',
    name: 'sample.mp4',
    path: 'C:/media/sample.mp4',
    kind: 'video',
    importedAt: new Date().toISOString(),
    metadata: {
      durationMs: 5000,
      formatName: 'mov,mp4',
      sizeBytes: 2048,
      hasVideo: true,
      hasAudio: true,
      width: 1920,
      height: 1080,
      previewLikelyUnsupported: false,
    },
  };

  it('fails cleanly on empty timeline', () => {
    const proj = createEmptyProject();
    const res = buildExportPlan(proj, { tempDir: 'C:/temp', finalTempPath: 'C:/temp/out.mp4' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('empty-timeline');
    }
  });

  it('generates direct render plan for normal sequence', () => {
    let proj = createEmptyProject();
    proj.assets.push(dummyAsset);
    proj = addClip(proj, dummyAsset.id, 'track-video-1').doc;

    const res = buildExportPlan(proj, { tempDir: 'C:/temp', finalTempPath: 'C:/temp/out.mp4' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.plan.steps.length).toBe(1);
    expect(res.plan.steps[0]?.stage).toBe('render');
    expect(res.plan.steps[0]?.args).toContain('-movflags');
  });

  it('generates 3-stage plan for seamless loop', () => {
    let proj = createEmptyProject();
    proj.assets.push(dummyAsset);
    proj = addClip(proj, dummyAsset.id, 'track-video-1').doc;

    proj.settings.loop.enabled = true;
    proj.settings.loop.targetDurationMs = 20000;
    proj.settings.loop.videoCrossfadeMs = 1000;

    const res = buildExportPlan(proj, { tempDir: 'C:/temp', finalTempPath: 'C:/temp/out.mp4' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.plan.steps.length).toBe(3);
    expect(res.plan.steps[0]?.stage).toBe('unit');
    expect(res.plan.steps[1]?.stage).toBe('segments');
    expect(res.plan.steps[2]?.stage).toBe('final');
  });

  it('generates loop preview plan', () => {
    let proj = createEmptyProject();
    proj.assets.push(dummyAsset);
    proj = addClip(proj, dummyAsset.id, 'track-video-1').doc;

    proj.settings.loop.enabled = true;
    proj.settings.loop.videoCrossfadeMs = 1000;

    const res = buildLoopPreviewPlan(proj, 'C:/temp/prev.mp4', 'C:/temp');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.plan.args).toContain('-c:v');
    expect(res.plan.durationMs).toBeGreaterThan(0);
  });
});
