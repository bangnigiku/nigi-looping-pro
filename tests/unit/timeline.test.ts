import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../src/shared/project';
import {
  activeVideoClipAt,
  addClip,
  clipDuration,
  clipEnd,
  deleteClip,
  globalTimeToClipSourceMs,
  moveClip,
  nextClipAfter,
  sequenceDuration,
  splitClip,
  trimClipEnd,
  trimClipStart,
} from '../../src/shared/timeline';
import type { MediaAsset } from '../../src/shared/types';

describe('timeline operations', () => {
  const dummyAsset: MediaAsset = {
    id: 'asset-1',
    name: 'test.mp4',
    path: '/path/test.mp4',
    kind: 'video',
    importedAt: new Date().toISOString(),
    metadata: {
      durationMs: 10000,
      formatName: 'mov,mp4',
      sizeBytes: 1024,
      hasVideo: true,
      hasAudio: true,
      width: 1920,
      height: 1080,
      previewLikelyUnsupported: false,
    },
  };

  it('adds clip to timeline without overlaps', () => {
    let proj = createEmptyProject();
    proj.assets.push(dummyAsset);

    const res1 = addClip(proj, dummyAsset.id, 'track-video-1');
    proj = res1.doc;
    expect(proj.clips.length).toBe(1);
    expect(res1.clip.startMs).toBe(0);
    expect(clipDuration(res1.clip)).toBe(10000);

    // Second clip is appended after first
    const res2 = addClip(proj, dummyAsset.id, 'track-video-1');
    proj = res2.doc;
    expect(proj.clips.length).toBe(2);
    expect(res2.clip.startMs).toBe(10000);
  });

  it('moves clip to new position', () => {
    let proj = createEmptyProject();
    proj.assets.push(dummyAsset);
    const { doc, clip } = addClip(proj, dummyAsset.id, 'track-video-1');
    proj = doc;

    proj = moveClip(proj, clip.id, 5000);
    const moved = proj.clips.find((c) => c.id === clip.id)!;
    expect(moved.startMs).toBe(5000);
  });

  it('trims clip start and end safely', () => {
    let proj = createEmptyProject();
    proj.assets.push(dummyAsset);
    const { doc, clip } = addClip(proj, dummyAsset.id, 'track-video-1');
    proj = doc;

    // Trim start: move start by +2000ms -> inMs becomes 2000
    proj = trimClipStart(proj, clip.id, 2000);
    let updated = proj.clips.find((c) => c.id === clip.id)!;
    expect(updated.startMs).toBe(2000);
    expect(updated.inMs).toBe(2000);
    expect(clipDuration(updated)).toBe(8000);

    // Trim end: set end to 8000ms -> duration becomes 6000ms
    proj = trimClipEnd(proj, clip.id, 8000);
    updated = proj.clips.find((c) => c.id === clip.id)!;
    expect(clipEnd(updated)).toBe(8000);
    expect(clipDuration(updated)).toBe(6000);
  });

  it('splits clip into two segments at playhead', () => {
    let proj = createEmptyProject();
    proj.assets.push(dummyAsset);
    const { doc, clip } = addClip(proj, dummyAsset.id, 'track-video-1');
    proj = doc;

    const splitRes = splitClip(proj, clip.id, 4000);
    expect(splitRes).not.toBeNull();
    if (!splitRes) return;

    proj = splitRes.doc;
    expect(proj.clips.length).toBe(2);

    expect(splitRes.left.startMs).toBe(0);
    expect(splitRes.left.inMs).toBe(0);
    expect(splitRes.left.outMs).toBe(4000);

    expect(splitRes.right.startMs).toBe(4000);
    expect(splitRes.right.inMs).toBe(4000);
    expect(splitRes.right.outMs).toBe(10000);
  });

  it('deletes clip from timeline', () => {
    let proj = createEmptyProject();
    proj.assets.push(dummyAsset);
    const { doc, clip } = addClip(proj, dummyAsset.id, 'track-video-1');
    proj = doc;

    proj = deleteClip(proj, clip.id);
    expect(proj.clips.length).toBe(0);
  });

  it('determines active clip across three sequential clips until the end', () => {
    let proj = createEmptyProject();
    proj.assets.push(dummyAsset);

    // Add 3 sequential 10-second clips
    proj = addClip(proj, dummyAsset.id, 'track-video-1').doc; // 0..10000
    proj = addClip(proj, dummyAsset.id, 'track-video-1').doc; // 10000..20000
    proj = addClip(proj, dummyAsset.id, 'track-video-1').doc; // 20000..30000

    expect(proj.clips.length).toBe(3);
    expect(sequenceDuration(proj)).toBe(30000);

    // Clip 1 start and middle
    const c1Start = activeVideoClipAt(proj, 0);
    expect(c1Start?.id).toBe(proj.clips[0]!.id);
    expect(globalTimeToClipSourceMs(c1Start!, 0)).toBe(0);

    const c1Mid = activeVideoClipAt(proj, 5000);
    expect(c1Mid?.id).toBe(proj.clips[0]!.id);
    expect(globalTimeToClipSourceMs(c1Mid!, 5000)).toBe(5000);

    // Transition to Clip 2 at boundary 10000
    const c2Start = activeVideoClipAt(proj, 10000);
    expect(c2Start?.id).toBe(proj.clips[1]!.id);
    expect(globalTimeToClipSourceMs(c2Start!, 10000)).toBe(0);

    const c2Mid = activeVideoClipAt(proj, 15000);
    expect(c2Mid?.id).toBe(proj.clips[1]!.id);
    expect(globalTimeToClipSourceMs(c2Mid!, 15000)).toBe(5000);

    // Transition to Clip 3 at boundary 20000
    const c3Start = activeVideoClipAt(proj, 20000);
    expect(c3Start?.id).toBe(proj.clips[2]!.id);
    expect(globalTimeToClipSourceMs(c3Start!, 20000)).toBe(0);

    const c3End = activeVideoClipAt(proj, 29999);
    expect(c3End?.id).toBe(proj.clips[2]!.id);
    expect(globalTimeToClipSourceMs(c3End!, 29999)).toBe(9999);

    // Beyond timeline end
    expect(activeVideoClipAt(proj, 30000)).toBeNull();
  });

  it('calculates source time correctly for trimmed clips', () => {
    let proj = createEmptyProject();
    proj.assets.push(dummyAsset);

    const { doc, clip } = addClip(proj, dummyAsset.id, 'track-video-1');
    proj = doc;

    // Trim inMs = 2000, outMs = 7000 (duration = 5000ms, starts at 0)
    clip.inMs = 2000;
    clip.outMs = 7000;

    expect(clipDuration(clip)).toBe(5000);
    expect(globalTimeToClipSourceMs(clip, 0)).toBe(2000);
    expect(globalTimeToClipSourceMs(clip, 2500)).toBe(4500);
    expect(globalTimeToClipSourceMs(clip, 5000)).toBe(7000);
  });

  it('handles playback gaps and locates next clip', () => {
    let proj = createEmptyProject();
    proj.assets.push(dummyAsset);

    // Clip 1 at 0..5000, Clip 2 moved to 8000..18000 (3000ms gap at 5000..8000)
    const res1 = addClip(proj, dummyAsset.id, 'track-video-1');
    res1.clip.outMs = 5000;
    proj = res1.doc;

    const res2 = addClip(proj, dummyAsset.id, 'track-video-1');
    res2.clip.startMs = 8000;
    proj = res2.doc;

    // During gap at 6000ms: no active clip
    expect(activeVideoClipAt(proj, 6000)).toBeNull();

    // Next clip after 6000ms is Clip 2
    const next = nextClipAfter(proj, 6000);
    expect(next?.id).toBe(res2.clip.id);
  });

  it('prioritizes overlay video track (track-video-2) over main track', () => {
    let proj = createEmptyProject();
    proj.assets.push(dummyAsset);
    proj.tracks.push({ id: 'track-video-2', kind: 'video', name: 'Video 2 (Overlay)', muted: false, hidden: false });

    const c1 = addClip(proj, dummyAsset.id, 'track-video-1'); // 0..10000
    proj = c1.doc;

    const c2 = addClip(proj, dummyAsset.id, 'track-video-2'); // starts at 0 on track-video-2
    c2.clip.startMs = 2000;
    c2.clip.outMs = 5000; // 2000..7000
    proj = c2.doc;

    // At 1000ms: only track-video-1 active
    expect(activeVideoClipAt(proj, 1000)?.trackId).toBe('track-video-1');

    // At 3000ms: both tracks active, track-video-2 overlay takes priority
    expect(activeVideoClipAt(proj, 3000)?.trackId).toBe('track-video-2');

    // At 8000ms: track-video-2 ended, falls back to track-video-1
    expect(activeVideoClipAt(proj, 8000)?.trackId).toBe('track-video-1');
  });
});

